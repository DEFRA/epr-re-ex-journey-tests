import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  addDays,
  lastDayOfMonth,
  LATEST_RETURN_DAYS_AFTER_DUE
} from '../calendar/calendar.js'
import {
  EVENT,
  ISSUE_KIND,
  ISSUE_SEVERITY,
  UPLOAD_OUTCOME
} from '../calendar/events.js'
import { createRun, executeEvent, expectedOutcome } from '../execute/execute.js'
import { DEFAULT_CALIBRATION } from '../population/calibration.js'
import { streamFor } from '../rows/rows.js'
import { planRun } from '../run/plan.js'
import { eventKey } from '../run/runner.js'
import {
  format,
  madeFatalShare,
  measure,
  MONTH_LABELS,
  monthsBetween,
  reachedDay
} from './measure.js'

/** @import {Seeders} from '../execute/seeders.js' */
/** @import {PrnEvent, ReportEvent, UploadEvent} from '../calendar/events.js' */
/** @import {ServiceView} from './service.js' */

const settings = {
  seed: 'summary',
  scale: 0.05,
  profileMix: 'production',
  from: '2026-01-01',
  to: '2026-08-31',
  calibration: 'unused'
}
const calibration = DEFAULT_CALIBRATION
const plan = planRun({ settings, calibration })
const { population, rows, events } = plan

/**
 * Seeders that grant ids and numbers as the service would, which is all an
 * approval needs and all the summary reads off the run.
 *
 * @returns {Seeders}
 */
function grantingSeeders() {
  let organisations = 0
  const answer = (value) => () => Promise.resolve(value)
  return /** @type {Seeders} */ (
    /** @type {unknown} */ ({
      createLinkedOrganisation: () => {
        organisations += 1
        return Promise.resolve({
          refNo: `org-${organisations}`,
          orgId: 500000 + organisations
        })
      },
      approveMigratedRegistration: (refNo, { registrationIndex }) =>
        Promise.resolve({
          registrationId: `${refNo}-reg-${registrationIndex}`,
          accreditationId: `${refNo}-acc-${registrationIndex}`,
          email: `${refNo}@example.com`
        }),
      changeMigratedStatus: answer(undefined),
      seedOverseasSites: answer(undefined),
      createAndRegisterDefraIdUser: (email) =>
        Promise.resolve({ userId: `user-for-${email}` }),
      linkDefraIdUser: answer({ Authorization: 'Bearer linked' }),
      signInDefraIdUser: answer({ Authorization: 'Bearer signed-in' })
    })
  )
}

const run = createRun({ population, rows, seeders: grantingSeeders() })
for (const event of events) {
  if (event.type === EVENT.REGISTRATION_APPROVED) await executeEvent(run, event)
}
const live = [...run.operators.values()].flatMap((operator) => [
  ...operator.registrations.values()
])
/** @param {string} registrationId */
const numbersOf = (registrationId) => {
  const registration = live.find(({ planned }) => planned.id === registrationId)
  assert.ok(registration)
  return registration
}
const planned = population.organisations.flatMap(
  (operator) => operator.registrations
)
/** @param {(registration: (typeof planned)[number]) => boolean} test */
const theOne = (test) => {
  const found = planned.filter(test)
  assert.equal(found.length, 1)
  return found[0]
}
const registeredOnly = theOne(
  (registration) => registration.accreditation === null
)
const cancelled = theOne(
  (registration) => registration.accreditation?.status === 'cancelled'
)

/** The service's status after each transition the calendar plans. */
const STATUS_AFTER = {
  [EVENT.PRN_DRAFTED]: 'draft',
  [EVENT.PRN_RAISED]: 'awaiting_authorisation',
  [EVENT.PRN_ISSUED]: 'awaiting_acceptance',
  [EVENT.PRN_ACCEPTED]: 'accepted',
  [EVENT.PRN_DELETED]: 'deleted',
  [EVENT.PRN_DISCARDED]: 'discarded',
  [EVENT.PRN_CANCELLATION_REQUESTED]: 'awaiting_cancellation',
  [EVENT.PRN_CANCELLED]: 'cancelled'
}

const uploads = events.filter(
  /** @returns {event is UploadEvent} */
  (event) => event.type === EVENT.SUMMARY_LOG_UPLOADED
)
const reports = events.filter(
  /** @returns {event is ReportEvent} */
  (event) => event.type === EVENT.REPORT_SUBMITTED
)
const noteEvents = events.filter(
  /** @returns {event is PrnEvent} */
  (event) => event.type.startsWith('prn.')
)

/**
 * The summary logs the service would list had it taken every planned upload
 * the executor makes exactly.
 *
 * @param {UploadEvent[]} planned
 * @returns {ServiceView['summaryLogs']}
 */
const summaryLogsOf = (planned) =>
  planned.flatMap((upload) => {
    const expected = expectedOutcome(upload)
    return expected
      ? [
          {
            registrationId: upload.registrationId,
            uploadedAt: upload.at,
            status: expected.status
          }
        ]
      : []
  })

/**
 * The service as it would stand had it taken every planned event exactly.
 *
 * @returns {ServiceView}
 */
function perfectService() {
  /** @type {PrnEvent[][]} */
  const chains = [...Map.groupBy(noteEvents, (event) => event.prnId).values()]
  return {
    organisations: population.organisations.map((operator) => ({
      type: operator.type,
      agency: operator.agency,
      registrations: operator.registrations.map((registration) => ({
        processingType: registration.processingType,
        material: registration.material.suffix,
        accredited: registration.accreditation !== null,
        sitePostcode: registration.siteId
      })),
      accreditations: operator.registrations.flatMap((registration) =>
        registration.accreditation
          ? [
              {
                status: registration.accreditation.status,
                tonnageBand: registration.accreditation.tonnageBand
              }
            ]
          : []
      )
    })),
    summaryLogs: summaryLogsOf(uploads),
    feedYear: '2026',
    reports: reports.map((report) => ({
      registrationNumber: numbersOf(report.registrationId).regNumber,
      reportType: report.cadence === 'monthly' ? 'Monthly' : 'Quarterly',
      reportingPeriod:
        report.cadence === 'monthly'
          ? `${MONTH_LABELS[report.period - 1]} ${report.year}`
          : `Q${report.period} ${report.year}`,
      submittedDate: report.at.slice(0, 10),
      submissionNumber: report.submissionNumber
    })),
    notes: noteEvents
      .filter((event) => event.type === EVENT.PRN_DRAFTED)
      .map((event) => ({
        accreditationNumber: String(numbersOf(event.registrationId).accNumber),
        createdAt: event.at
      })),
    noteTransitions: chains.flatMap((chain) =>
      chain.slice(1).map((event, index) => ({
        accreditationNumber: String(numbersOf(event.registrationId).accNumber),
        at: event.at,
        from: STATUS_AFTER[chain[index].type],
        to: STATUS_AFTER[event.type]
      }))
    )
  }
}

const service = perfectService()
const done = new Set(events.map(eventKey))
const sections = measure({
  settings,
  calibration,
  population,
  rows,
  events,
  done,
  run,
  service
})

/** @param {string} title */
const section = (title) => {
  const found = sections.find((candidate) => candidate.title === title)
  assert.ok(found, `no section ${title}`)
  return found
}
/** @param {import('./measure.js').SummarySection} of @param {string} label */
const row = (of, label) => {
  const found = of.rows.find((candidate) => candidate.label === label)
  assert.ok(found, `no row ${label} in ${of.title}`)
  return found.values
}
/** @param {{at: string}} event */
const month = (event) => event.at.slice(0, 7)

/**
 * The lateness section measured again with rows added to the feed.
 *
 * @param {ServiceView['reports']} extra
 * @param {string} [feedYear]
 */
function latenessWith(extra, feedYear = service.feedYear) {
  const found = measure({
    settings,
    calibration,
    population,
    rows,
    events,
    done,
    run,
    service: {
      ...service,
      feedYear,
      reports: [...service.reports, ...extra]
    }
  }).find((candidate) => candidate.title === 'Reports against their due day')
  assert.ok(found)
  return found
}

describe('the estate', () => {
  it('counts what the service holds against the register at the run’s scale', () => {
    const types = section('Organisations by type')
    for (const type of ['exporter', 'reprocessor', 'both']) {
      assert.deepEqual(row(types, type).count, {
        generated: population.organisations.filter(
          (operator) => operator.type === type
        ).length,
        target: calibration.register.organisationType[type] * settings.scale
      })
    }
    assert.equal(
      row(section('Registrations by agency'), 'EA').count.target,
      calibration.register.agencyRows.EA * settings.scale
    )
    assert.equal(
      row(section('Accreditation status'), 'none').count.generated,
      population.organisations
        .flatMap((operator) => operator.registrations)
        .filter((registration) => registration.accreditation === null).length
    )
  })

  it('counts registrations, materials and sites per organisation', () => {
    const perOrganisation = section('Registrations per organisation')
    assert.deepEqual(
      perOrganisation.rows.reduce(
        (total, line) => total + line.values.count.generated,
        0
      ),
      population.organisations.length
    )
    assert.equal(
      row(perOrganisation, '1').count.target,
      calibration.register.registrationsPerOrganisation[1] * settings.scale
    )
    const sites = section('Sites per reprocessor organisation')
    assert.equal(
      sites.rows.reduce(
        (total, line) => total + line.values.count.generated,
        0
      ),
      population.organisations.filter((operator) => operator.sites.length > 0)
        .length
    )
    assert.equal(
      row(sites, '1').count.generated,
      population.organisations.filter((operator) => operator.sites.length === 1)
        .length
    )
  })

  it('derives the Annex II process targets from the rows by material', () => {
    const processes = section('Registrations by Annex II process')
    const { rowsByTypeAndMaterial } = calibration.register
    assert.equal(
      row(processes, 'R4').count.target,
      (rowsByTypeAndMaterial.exporter.AL +
        rowsByTypeAndMaterial.exporter.ST +
        rowsByTypeAndMaterial.reprocessor.AL +
        rowsByTypeAndMaterial.reprocessor.ST) *
        settings.scale
    )
  })
})

describe('summary logs a month', () => {
  const stream = 'exporter'
  const ids = new Set(
    rows.registrations
      .filter((planned) => planned.stream === stream)
      .map((planned) => planned.registrationId)
  )
  const own = uploads.filter((upload) => ids.has(upload.registrationId))
  const logs = section(`Summary logs a month: ${stream}`)

  it('has a row per month the run reached', () => {
    assert.deepEqual(
      logs.rows.map((line) => line.label),
      monthsBetween(settings.from, settings.to)
    )
  })

  it('counts the attempts the executor makes from the plan and the landed and refused ones from the service', () => {
    const values = row(logs, '2026-03')
    const inMarch = own.filter((upload) => month(upload) === '2026-03')
    const made = inMarch.filter((upload) => expectedOutcome(upload) !== null)
    const kindsOf = (/** @type {UploadEvent[]} */ some) =>
      new Set(some.map((upload) => upload.issues?.kind ?? upload.outcome))
    assert.ok(kindsOf(made).has(ISSUE_KIND.REMOVED_ROW))
    assert.ok(kindsOf(made).has(UPLOAD_OUTCOME.SUBMITTED))
    assert.ok(!kindsOf(made).has(ISSUE_KIND.UNREADABLE))
    assert.ok(!kindsOf(made).has(ISSUE_KIND.BLANK_FIELD))
    assert.ok(!kindsOf(made).has(UPLOAD_OUTCOME.ABANDONED))
    assert.ok(kindsOf(inMarch).has(ISSUE_KIND.BLANK_FIELD))
    assert.equal(values.uploads.generated, made.length)
    assert.equal(
      values.submitted.generated,
      inMarch.filter((upload) => upload.outcome === UPLOAD_OUTCOME.SUBMITTED)
        .length
    )
    assert.equal(
      values.invalid.generated,
      made.filter((upload) => upload.issues?.severity === ISSUE_SEVERITY.FATAL)
        .length
    )
    assert.equal(
      values['amended rows'].generated,
      inMarch
        .filter((upload) => upload.outcome === UPLOAD_OUTCOME.SUBMITTED)
        .reduce(
          (total, upload) =>
            total + (upload.amendments?.count ?? 0) + upload.restated.length,
          0
        )
    )
  })

  const fatalShareExpressed = madeFatalShare(calibration)

  /** @param {string} lastDay - ISO date */
  const owingBy = (lastDay) =>
    population.organisations.flatMap((operator) =>
      operator.registrations
        .filter(
          (registration) =>
            ids.has(registration.id) && registration.activeFrom <= lastDay
        )
        .map((registration) => ({ operator, registration }))
    )
  const { perReportingPeriod } = calibration.activity.uploads

  it('targets the landing rate over the registrations owing the month, and the attempts the executor makes beyond it', () => {
    const values = row(logs, '2026-06')
    const owing = owingBy('2026-06-30')
    /** @param {(typeof owing)[number]} member */
    const landing = ({ registration }) =>
      perReportingPeriod - (registration.activeFrom >= '2026-06-01' ? 1 : 0)
    assert.equal(
      values.submitted.target,
      owing.reduce((total, member) => total + landing(member), 0)
    )
    const madeRejections = owing.reduce((total, member) => {
      const rates = member.operator.profile.uploads
      return (
        total +
        landing(member) *
          rates.rejectionRate *
          rates.extraAttemptsWhenRejected *
          rates.fatalShare *
          fatalShareExpressed
      )
    }, 0)
    assert.ok(madeRejections > 0)
    assert.ok(
      Math.abs(
        values.uploads.target - values.submitted.target - madeRejections
      ) < 1e-9
    )
    assert.ok(Math.abs(values.invalid.target - madeRejections) < 1e-9)
  })

  it('asks one upload fewer of a registration’s first reporting period, whose closing upload lands after it with nothing landing in it from before', () => {
    assert.equal(
      row(logs, '2026-01').submitted.target,
      owingBy('2026-01-31').length * (perReportingPeriod - 1)
    )
    const quarterly = section(
      `Summary logs a month: ${streamFor(registeredOnly)}`
    )
    assert.ok(registeredOnly.activeFrom < '2026-04-01')
    for (const { months, landing } of [
      {
        months: ['2026-01', '2026-02', '2026-03'],
        landing: perReportingPeriod - 1
      },
      { months: ['2026-04', '2026-05', '2026-06'], landing: perReportingPeriod }
    ]) {
      for (const label of months) {
        assert.ok(
          Math.abs(row(quarterly, label).submitted.target - landing / 3) < 1e-9,
          label
        )
      }
    }
  })

  it('expects every rejection of a registered-only stream to be fatal, spoiling a removed row or a bad date at the same made share as an accredited one', () => {
    const values = row(
      section(`Summary logs a month: ${streamFor(registeredOnly)}`),
      '2026-07'
    )
    assert.ok(registeredOnly.activeFrom <= '2026-07-31')
    const operator = population.organisations.find(
      ({ id }) => id === registeredOnly.organisationId
    )
    assert.ok(operator)
    const rates = operator.profile.uploads
    assert.ok(
      Math.abs(
        values.invalid.target -
          (rates.perReportingPeriod / 3) *
            rates.rejectionRate *
            rates.extraAttemptsWhenRejected *
            fatalShareExpressed
      ) < 1e-9
    )
  })
})

/**
 * Each registration draws its uploads a period evenly either side of the rate,
 * so a stream of seventy to a hundred and seventy registrations lands its
 * first month up to a fifth either side of target by the seed. The
 * registered-only streams hold under twenty registrations between them, so
 * they are held together over their first quarter, to three tenths. A target
 * asking a full first period reads these at about a half.
 */
describe('the first months of a seeded plan at full scale', () => {
  const firstQuarter = {
    ...settings,
    seed: 'pepr',
    scale: 1,
    to: '2026-03-31'
  }
  const early = planRun({ settings: firstQuarter, calibration })
  const measured = measure({
    settings: firstQuarter,
    calibration,
    population: early.population,
    rows: early.rows,
    events: early.events,
    done: new Set(early.events.map(eventKey)),
    run: createRun({
      population: early.population,
      rows: early.rows,
      seeders: grantingSeeders()
    }),
    service: {
      organisations: [],
      summaryLogs: summaryLogsOf(
        early.events.filter(
          /** @returns {event is UploadEvent} */
          (event) => event.type === EVENT.SUMMARY_LOG_UPLOADED
        )
      ),
      feedYear: '2026',
      reports: [],
      notes: [],
      noteTransitions: []
    }
  })
  /**
   * What the streams submitted over some months, over what they were asked.
   *
   * @param {string[]} streams
   * @param {string[]} months
   */
  const submittedRatio = (streams, months) => {
    const values = streams.flatMap((stream) => {
      const found = measured.find(
        (candidate) => candidate.title === `Summary logs a month: ${stream}`
      )
      assert.ok(found, `no section for ${stream}`)
      return found.rows
        .filter((line) => months.includes(line.label))
        .map((line) => line.values.submitted)
    })
    return (
      values.reduce((total, value) => total + value.generated, 0) /
      values.reduce((total, value) => total + value.target, 0)
    )
  }
  /** @param {number} actual @param {number} tolerance @param {string} of */
  const onTarget = (actual, tolerance, of) =>
    assert.ok(
      Math.abs(actual - 1) <= tolerance,
      `${of} reads ${actual.toFixed(2)} of target`
    )

  for (const stream of ['exporter', 'reprocessorInput', 'reprocessorOutput']) {
    it(`submits January’s uploads at target on the ${stream} stream`, () => {
      onTarget(submittedRatio([stream], ['2026-01']), 0.2, stream)
    })
  }

  it('submits a registered-only registration’s first quarter at target', () => {
    onTarget(
      submittedRatio(
        ['regOnlyExporter', 'regOnlyReprocessor'],
        ['2026-01', '2026-02', '2026-03']
      ),
      0.3,
      'the registered-only streams'
    )
  })
})

describe('reports', () => {
  const lateness = section('Reports against their due day')

  it('shares the settled reports out between the four buckets', () => {
    const total = [
      'on time',
      'late within 7 days',
      'late within 30 days',
      'late beyond 30 days'
    ].reduce((sum, label) => sum + row(lateness, label).share.generated, 0)
    assert.ok(Math.abs(total - 1) < 1e-9)
    assert.ok(row(lateness, 'on time').share.generated > 0.5)
  })

  it('counts a period the feed shows blank as missed, and a second submission as a resubmission', () => {
    const withBlank = latenessWith([
      {
        registrationNumber: live[0].regNumber,
        reportType: 'Monthly',
        reportingPeriod: 'Jan 2026',
        submittedDate: null,
        submissionNumber: null
      }
    ])
    assert.ok(
      row(withBlank, 'missed').share.generated >
        row(lateness, 'missed').share.generated
    )
    assert.equal(
      row(lateness, 'resubmitted').share.generated,
      reports.filter(
        (report) =>
          report.submissionNumber === 2 &&
          settledBy(report, '2026-08-31', calibration.punctuality.dueDay)
      ).length /
        reports.filter(
          (report) =>
            report.submissionNumber === 1 &&
            settledBy(report, '2026-08-31', calibration.punctuality.dueDay)
        ).length
    )
  })

  it('counts only the year the feed listed every period of, since an earlier year keeps its filed periods and loses its missed ones', () => {
    const otherYear = latenessWith([], '2027')
    for (const label of ['on time', 'late beyond 30 days', 'missed']) {
      assert.equal(row(otherYear, label).share.generated, 0)
    }
  })

  it('leaves out a blank period the plan never owed: at a cadence it does not report at, or after its cancellation', () => {
    const cancelledOn = events.find(
      (event) => event.type === EVENT.ACCREDITATION_CANCELLED
    )
    assert.ok(cancelledOn)
    assert.equal(cancelledOn.registrationId, cancelled.id)
    assert.ok(cancelledOn.at.slice(0, 10) < '2026-08-31')
    /**
     * @param {string} registrationNumber
     * @param {string} reportType
     * @param {string} reportingPeriod
     */
    const blank = (registrationNumber, reportType, reportingPeriod) => ({
      registrationNumber,
      reportType,
      reportingPeriod,
      submittedDate: null,
      submissionNumber: null
    })
    const unowed = latenessWith([
      blank(numbersOf(registeredOnly.id).regNumber, 'Monthly', 'Jan 2026'),
      blank(numbersOf(cancelled.id).regNumber, 'Quarterly', 'Q1 2026'),
      blank(numbersOf(cancelled.id).regNumber, 'Monthly', 'Aug 2026')
    ])
    assert.equal(
      row(unowed, 'missed').share.generated,
      row(lateness, 'missed').share.generated
    )
    const owed = latenessWith([
      blank(numbersOf(cancelled.id).regNumber, 'Monthly', 'Apr 2026')
    ])
    assert.ok(
      row(owed, 'missed').share.generated >
        row(lateness, 'missed').share.generated
    )
  })
})

/**
 * Whether every late return of a report's period has had time to arrive by
 * a day: its due day plus the ninety days the calendar plans up to.
 *
 * @param {ReportEvent} report
 * @param {string} by
 * @param {number} dueDay
 */
function settledBy(report, by, dueDay) {
  const endMonth = report.period * (report.cadence === 'monthly' ? 1 : 3)
  const due = new Date(Date.UTC(report.year, endMonth, dueDay))
    .toISOString()
    .slice(0, 10)
  return addDays(due, LATEST_RETURN_DAYS_AFTER_DUE) <= by
}

describe('notes', () => {
  const monthly = section('Notes a month')

  it('counts each transition the service logged in its month', () => {
    const values = row(monthly, '2026-04')
    const inApril = noteEvents.filter((event) => month(event) === '2026-04')
    assert.equal(
      values.drafted.generated,
      inApril.filter((event) => event.type === EVENT.PRN_DRAFTED).length
    )
    assert.equal(
      values.issued.generated,
      inApril.filter((event) => event.type === EVENT.PRN_ISSUED).length
    )
    assert.equal(
      values.accepted.generated,
      inApril.filter((event) => event.type === EVENT.PRN_ACCEPTED).length
    )
  })

  /**
   * The accredited registrations the calendar drafts notes for in a month:
   * submitted by then, and not suspended or cancelled before it.
   *
   * @param {string} inMonth
   */
  const issuingIn = (inMonth) =>
    population.organisations
      .flatMap((operator) =>
        operator.registrations.map((registration) => ({
          operator,
          registration
        }))
      )
      .filter(({ registration }) => {
        const own = events.filter(
          (event) => event.registrationId === registration.id
        )
        const ended = own.find((event) =>
          event.type.startsWith('accreditation.')
        )
        const dayBefore = ended
          ? new Date(Date.parse(ended.at) - 24 * 60 * 60 * 1000)
              .toISOString()
              .slice(0, 7)
          : null
        const first = own.find(
          (event) =>
            event.type === EVENT.SUMMARY_LOG_UPLOADED &&
            event.outcome === UPLOAD_OUTCOME.SUBMITTED
        )
        return (
          registration.accreditation !== null &&
          first !== undefined &&
          addDays(first.at.slice(0, 10), 1).slice(0, 7) <= inMonth &&
          (dayBefore === null || inMonth <= dayBefore)
        )
      })

  /** @param {string} inMonth */
  const draftedTarget = (inMonth) =>
    calibration.activity.prnsPerAccreditationPerMonth *
    issuingIn(inMonth).reduce(
      (sum, { operator }) => sum + operator.profile.volumeFactor,
      0
    )

  it('targets the calibrated rate per accreditation from the month it first submitted', () => {
    const values = row(monthly, '2026-04')
    assert.ok(issuingIn('2026-04').length > 0)
    assert.ok(Math.abs(values.drafted.target - draftedTarget('2026-04')) < 1e-9)
    assert.ok(values.raised.target < values.drafted.target)
    assert.ok(values.accepted.target < values.issued.target)
  })

  /**
   * A month's notes are accepted in it at the same-month share and the rest
   * the month after, so a registration's first issuing month has only its own
   * notes' share to accept.
   *
   * @param {string} inMonth
   */
  const acceptedTarget = (inMonth) => {
    const monthBefore = addDays(`${inMonth}-01`, -1).slice(0, 7)
    const carrying = new Set(
      issuingIn(monthBefore).map(({ registration }) => registration.id)
    )
    return issuingIn(inMonth).reduce((sum, { operator, registration }) => {
      const { prn, volumeFactor } = operator.profile
      const accepted =
        calibration.activity.prnsPerAccreditationPerMonth *
        volumeFactor *
        (1 - prn.discardRate) *
        (1 - prn.deleteRate) *
        (1 - prn.cancelRate) *
        prn.producerAcceptRate
      return (
        sum +
        (carrying.has(registration.id)
          ? accepted
          : accepted * prn.sameMonthAcceptanceShare)
      )
    }, 0)
  }

  it('targets acceptances in the month the calibration lands them, with none carried into a registration’s first issuing month', () => {
    const starting = monthly.rows.filter(({ label }) => {
      const monthBefore = addDays(`${label}-01`, -1).slice(0, 7)
      const before = new Set(
        issuingIn(monthBefore).map(({ registration }) => registration.id)
      )
      return issuingIn(label).some(
        ({ registration }) => !before.has(registration.id)
      )
    })
    assert.ok(starting.length >= 2)
    assert.ok(starting.length < monthly.rows.length)
    for (const { label, values } of monthly.rows) {
      assert.ok(
        Math.abs(values.accepted.target - acceptedTarget(label)) < 1e-9,
        label
      )
    }
  })

  it('targets the run’s acceptances by material as the months’ targets add up', () => {
    const byMaterial = section(
      'Notes by material and export flag, over the run'
    )
    assert.ok(
      Math.abs(
        byMaterial.rows.reduce(
          (sum, line) => sum + line.values.accepted.target,
          0
        ) -
          monthly.rows.reduce(
            (sum, line) => sum + line.values.accepted.target,
            0
          )
      ) < 1e-9
    )
  })

  it('counts a suspended or cancelled accreditation up to the month before its status changed', () => {
    const suspended = events.find(
      (event) => event.type === EVENT.ACCREDITATION_SUSPENDED
    )
    assert.ok(suspended)
    const [year, month] = suspended.at.split('-').map(Number)
    const monthOf = suspended.at.slice(0, 7)
    const monthAfter = addDays(lastDayOfMonth(year, month), 1).slice(0, 7)
    assert.ok(suspended.at.slice(0, 10) > `${monthOf}-01`)
    /** @param {string} inMonth */
    const ids = (inMonth) =>
      issuingIn(inMonth).map(({ registration }) => registration.id)
    assert.ok(ids(monthOf).includes(suspended.registrationId))
    assert.ok(!ids(monthAfter).includes(suspended.registrationId))
    for (const inMonth of [monthOf, monthAfter]) {
      assert.ok(
        Math.abs(
          row(monthly, inMonth).drafted.target - draftedTarget(inMonth)
        ) < 1e-9,
        inMonth
      )
    }
  })

  it('splits the run’s notes by the planned material and export flag', () => {
    const byMaterial = section(
      'Notes by material and export flag, over the run'
    )
    assert.equal(
      byMaterial.rows.reduce(
        (sum, line) => sum + line.values.drafted.generated,
        0
      ),
      noteEvents.filter((event) => event.type === EVENT.PRN_DRAFTED).length
    )
    assert.ok(
      byMaterial.rows.every((line) =>
        /^(export|reprocess) [A-Z]{2}$/.test(line.label)
      )
    )
  })
})

describe('the run reached', () => {
  it('is the day of the last executed event, and the first day of a run with none', () => {
    const executed = events.filter((event) => done.has(eventKey(event)))
    assert.equal(reachedDay(executed, settings), events.at(-1)?.at.slice(0, 10))
    assert.equal(reachedDay([], settings), settings.from)
  })

  it('cuts the months to what a part-run reached', () => {
    const partial = measure({
      settings,
      calibration,
      population,
      rows,
      events,
      done: new Set(
        events.filter((event) => event.at < '2026-03-15').map(eventKey)
      ),
      run,
      service
    })
    const logs = partial.find((candidate) =>
      candidate.title.startsWith('Summary logs a month')
    )
    assert.deepEqual(
      logs?.rows.map((line) => line.label),
      ['2026-01', '2026-02', '2026-03']
    )
  })
})

describe('madeFatalShare', () => {
  it('weighs the kinds the route can express against every fatal kind the calibration names', () => {
    const share = madeFatalShare({
      ...DEFAULT_CALIBRATION,
      activity: {
        ...DEFAULT_CALIBRATION.activity,
        uploadIssueKinds: {
          fatal: { removedRow: 3, badDate: 2, unreadable: 5 },
          error: { blankField: 1 }
        }
      }
    })
    assert.equal(share, 0.5)
  })
})

describe('monthsBetween', () => {
  it('lists every month from the first to the last, across a year end', () => {
    assert.deepEqual(monthsBetween('2026-11-15', '2027-02-01'), [
      '2026-11',
      '2026-12',
      '2027-01',
      '2027-02'
    ])
  })
})

describe('format', () => {
  const text = format([
    {
      title: 'Things',
      source: 'somewhere',
      metrics: ['count'],
      rows: [
        { label: 'near', values: { count: { generated: 9, target: 10 } } },
        { label: 'none', values: { count: { generated: 0, target: 0 } } },
        { label: 'unasked', values: { count: { generated: 3, target: 0 } } },
        { label: 'scaled', values: { count: { generated: 2, target: 1.5 } } }
      ]
    }
  ])

  it('prints generated, target and the ratio to two decimals', () => {
    assert.match(text, /^## Things\nGenerated from somewhere\./)
    assert.match(text, /near\s+9\s+10\s+0\.90/)
    assert.match(text, /scaled\s+2\s+1\.50\s+1\.33/)
  })

  it('leaves the ratio blank where nothing was asked for or made, and marks what was made unasked', () => {
    assert.match(text, /none\s+0\s+0\s*\n/)
    assert.match(text, /unasked\s+3\s+0\s+∞/)
  })
})
