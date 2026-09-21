/**
 * Measures what a run generated against what its calibration asked for.
 *
 * Pure: the service's view arrives as data (see `service.js`), the plan as
 * the population and events the run was planned with, and what was executed
 * as the journal's keys. Every target is the calibration the run was planned
 * with, scaled to the run: the register counts by the run's scale, and the
 * activity rates by the registrations the run holds, each at the rate its
 * operator's profile spread the calibration into. Under the production mix
 * those profiles average back to the calibration exactly.
 */

import { MATERIALS } from '../../materials.js'
import {
  addDays,
  cadenceOf,
  daysBetween,
  EARLY_DAYS_BEFORE_DUE,
  lastDayOfMonth,
  LATEST_RETURN_DAYS_AFTER_DUE,
  MONTHS_PER_PERIOD
} from '../calendar/calendar.js'
import {
  CADENCE,
  EVENT,
  ISSUE_KIND,
  UPLOAD_OUTCOME
} from '../calendar/events.js'
import { EXPRESSIBLE_ISSUE_KINDS, expectedOutcome } from '../execute/execute.js'
import { CONTRIBUTION, SHEETS } from '../rows/sheets.js'
import { eventKey } from '../run/runner.js'

/** @import {Calibration} from '../population/calibration.js' */
/** @import {PlannedOperator, PlannedPopulation, PlannedRegistration} from '../population/population.js' */
/** @import {BehaviourProfile} from '../population/profiles.js' */
/** @import {CalendarEvent, UploadEvent} from '../calendar/events.js' */
/** @import {RunSettings} from '../run/journal.js' */
/** @import {Run} from '../execute/execute.js' */
/** @import {ServiceView} from './service.js' */

/**
 * @typedef {Object} Measure - one generated figure beside its target
 * @property {number} generated
 * @property {number} target
 */

/**
 * @typedef {Object} SummaryRow
 * @property {string} label
 * @property {Record<string, Measure>} values - keyed by the section's metrics
 */

/**
 * @typedef {Object} SummarySection
 * @property {string} title
 * @property {string} source - where the generated figures were read from
 * @property {string[]} metrics - the columns, in order
 * @property {SummaryRow[]} rows
 */

/**
 * How late a first return landed, as the calibration buckets it, each with
 * the profile rate it is measured against.
 *
 * @type {[string, keyof BehaviourProfile['reporting']][]}
 */
const LATENESS_BUCKETS = [
  ['on time', 'onTime'],
  ['late within 7 days', 'lateWithin7'],
  ['late within 30 days', 'lateWithin30'],
  ['late beyond 30 days', 'lateBeyond30']
]

/** @typedef {'raised' | 'issued' | 'accepted' | 'deleted' | 'discarded' | 'cancellation requested' | 'cancelled'} NoteTransition */

/**
 * The transitions of a note the service records, as from and to statuses.
 *
 * @type {{metric: NoteTransition, from: string, to: string}[]}
 */
const NOTE_TRANSITIONS = [
  { metric: 'raised', from: 'draft', to: 'awaiting_authorisation' },
  {
    metric: 'issued',
    from: 'awaiting_authorisation',
    to: 'awaiting_acceptance'
  },
  { metric: 'accepted', from: 'awaiting_acceptance', to: 'accepted' },
  { metric: 'deleted', from: 'awaiting_authorisation', to: 'deleted' },
  { metric: 'discarded', from: 'draft', to: 'discarded' },
  {
    metric: 'cancellation requested',
    from: 'awaiting_acceptance',
    to: 'awaiting_cancellation'
  },
  { metric: 'cancelled', from: 'awaiting_cancellation', to: 'cancelled' }
]

/** The register calls a registered-only registration's accreditation status this. */
const REGISTERED_ONLY = 'none'

/**
 * The rows a stream's submissions carry, as the calibration counts them: a
 * registered-only stream reports its `registeredOnly` rows.
 *
 * @param {Calibration} calibration
 * @param {string} stream
 */
function rowsPerSubmissionOf(calibration, stream) {
  const key = stream.startsWith('regOnly') ? 'registeredOnly' : stream
  const rows = calibration.activity.rowsPerSubmission[key]
  if (!rows) {
    throw new Error(
      `The calibration counts no rows per submission for ${stream}`
    )
  }
  return rows
}

/** How the report submissions feed labels a monthly period, before the year. */
export const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec'
]

/** @param {string} instant */
const monthOf = (instant) => instant.slice(0, 7)

/** @param {string} a @param {string} b */
const later = (a, b) => (a > b ? a : b)

/**
 * Every month from the first to the last, as `YYYY-MM`.
 *
 * @param {string} from - ISO date
 * @param {string} to - ISO date
 */
export function monthsBetween(from, to) {
  const months = []
  const [year, month] = from.slice(0, 7).split('-').map(Number)
  for (let index = 0; ; index++) {
    const next = new Date(Date.UTC(year, month - 1 + index, 1))
      .toISOString()
      .slice(0, 7)
    if (next > monthOf(to)) return months
    months.push(next)
  }
}

/**
 * @template T
 * @param {T[]} members
 * @param {(member: T) => number} read
 */
const sum = (members, read) =>
  members.reduce((total, member) => total + read(member), 0)

/**
 * @template T
 * @param {T[]} members
 * @param {(member: T) => number} read
 */
const mean = (members, read) =>
  members.length === 0 ? 0 : sum(members, read) / members.length

/**
 * @template T
 * @param {T[]} members
 * @param {(member: T) => string | null} read - null leaves the member out
 * @returns {Record<string, number>}
 */
function tally(members, read) {
  /** @type {Record<string, number>} */
  const counts = {}
  for (const member of members) {
    const key = read(member)
    if (key !== null) counts[key] = (counts[key] ?? 0) + 1
  }
  return counts
}

/**
 * Rows of one figure each, one per key of the target counts, with the
 * generated tally beside them and any key generated but not targeted last.
 *
 * @param {Record<string, number>} generated
 * @param {Record<string, number>} targets
 * @returns {SummaryRow[]}
 */
function countRows(generated, targets) {
  const keys = [
    ...Object.keys(targets),
    ...Object.keys(generated).filter((key) => !(key in targets))
  ]
  return keys.map((key) => ({
    label: key,
    values: {
      count: { generated: generated[key] ?? 0, target: targets[key] ?? 0 }
    }
  }))
}

/** @param {Record<string, number>} counts @param {number} scale */
const scaled = (counts, scale) =>
  Object.fromEntries(
    Object.entries(counts).map(([key, count]) => [key, count * scale])
  )

/**
 * @param {PlannedPopulation} population
 * @returns {Map<string, {operator: PlannedOperator, registration: PlannedRegistration}>} by planned registration id
 */
function registrationsOf(population) {
  return new Map(
    population.organisations.flatMap((operator) =>
      operator.registrations.map((registration) => [
        registration.id,
        { operator, registration }
      ])
    )
  )
}

/**
 * The estate as the service holds it, against the register the calibration
 * describes at the run's scale.
 *
 * @param {ServiceView} service
 * @param {Calibration} calibration
 * @param {number} scale
 * @returns {SummarySection[]}
 */
function estateSections(service, calibration, scale) {
  const { register } = calibration
  const organisations = service.organisations
  const registrations = organisations.flatMap((organisation) =>
    organisation.registrations.map((registration) => ({
      ...registration,
      agency: organisation.agency
    }))
  )
  const accreditations = organisations.flatMap(
    (organisation) => organisation.accreditations
  )
  const processOf = Object.fromEntries(
    MATERIALS.map((material) => [material.suffix, material.process])
  )
  const reprocessing = organisations
    .map((organisation) =>
      organisation.registrations.filter(
        (registration) => registration.processingType === 'reprocessor'
      )
    )
    .filter((registrations) => registrations.length > 0)
  const rowsByProcess = tallyBy(
    Object.entries(register.rowsByTypeAndMaterial).flatMap(([, materials]) =>
      Object.entries(materials)
    ),
    ([suffix]) => processOf[suffix],
    ([, rows]) => rows
  )

  /**
   * @param {string} title
   * @param {Record<string, number>} generated
   * @param {Record<string, number>} targets
   * @returns {SummarySection}
   */
  const section = (title, generated, targets) => ({
    title,
    source: 'the service, organisation by organisation',
    metrics: ['count'],
    rows: countRows(generated, scaled(targets, scale))
  })

  return [
    section(
      'Organisations by type',
      tally(organisations, (organisation) => organisation.type),
      register.organisationType
    ),
    section(
      'Registrations by type and material',
      tally(
        registrations,
        (registration) =>
          `${registration.processingType} ${registration.material}`
      ),
      Object.fromEntries(
        Object.entries(register.rowsByTypeAndMaterial).flatMap(
          ([type, materials]) =>
            Object.entries(materials).map(([suffix, rows]) => [
              `${type} ${suffix}`,
              rows
            ])
        )
      )
    ),
    section(
      'Registrations per organisation',
      tally(organisations, (organisation) =>
        String(organisation.registrations.length)
      ),
      register.registrationsPerOrganisation
    ),
    section(
      'Materials per organisation',
      tally(organisations, (organisation) =>
        String(
          new Set(
            organisation.registrations.map(
              (registration) => registration.material
            )
          ).size
        )
      ),
      register.materialsPerOrganisation
    ),
    section(
      'Sites per reprocessor organisation',
      tally(reprocessing, (registrations) =>
        String(
          new Set(
            registrations.map((registration) => registration.sitePostcode)
          ).size
        )
      ),
      register.sitesPerReprocessorOrganisation
    ),
    section(
      'Registrations by Annex II process',
      tally(registrations, (registration) => processOf[registration.material]),
      rowsByProcess
    ),
    section(
      'Registrations by agency',
      tally(registrations, (registration) => registration.agency),
      register.agencyRows
    ),
    section(
      'Accreditations by tonnage band',
      tally(accreditations, (accreditation) => accreditation.tonnageBand),
      register.tonnageBand
    ),
    section(
      'Accreditation status',
      {
        ...tally(accreditations, (accreditation) => accreditation.status),
        [REGISTERED_ONLY]: registrations.filter(
          (registration) => !registration.accredited
        ).length
      },
      register.accreditationStatus
    )
  ]
}

/**
 * @template T
 * @param {T[]} members
 * @param {(member: T) => string} key
 * @param {(member: T) => number} amount
 * @returns {Record<string, number>}
 */
function tallyBy(members, key, amount) {
  /** @type {Record<string, number>} */
  const totals = {}
  for (const member of members) {
    totals[key(member)] = (totals[key(member)] ?? 0) + amount(member)
  }
  return totals
}

/**
 * The last day a registration's accreditation lets it act, as the calendar
 * plans it: the accreditation's last valid day, or the run's last day for a
 * registered-only registration.
 *
 * @param {PlannedRegistration} registration
 * @param {string} to
 */
const validUntil = (registration, to) =>
  registration.accreditation?.validTo ?? to

/**
 * Whether a registration owes a month's activity: it had gone active by the
 * end of the month, its accreditation was still valid when the month began,
 * and it had not been cancelled before then. A suspended accreditation still
 * reports.
 *
 * @param {PlannedRegistration} registration
 * @param {string} month - `YYYY-MM`
 * @param {Map<string, string>} cancelledOn - registration id to the day its accreditation was cancelled
 * @param {string} to - the last day the run reached
 */
function owesMonth(registration, month, cancelledOn, to) {
  const [year, index] = month.split('-').map(Number)
  const cancelled = cancelledOn.get(registration.id)
  return (
    registration.activeFrom <= lastDayOfMonth(year, index) &&
    month <= monthOf(validUntil(registration, to)) &&
    (cancelled === undefined || monthOf(cancelled) >= month)
  )
}

/**
 * Summary log uploads a month, per stream: what was made, what the service
 * refused outright, and what it accepted, against the rate each
 * registration's profile gives it. The calendar plans attempts the executor
 * does not make, because the route cannot express them (see
 * `../execute/README.md`), and those are left out of both sides.
 *
 * @param {Object} options
 * @param {PlannedPopulation} options.population
 * @param {CalendarEvent[]} options.executed
 * @param {Map<string, string>} options.streams - planned registration id to stream
 * @param {Map<string, string>} options.cancelledOn
 * @param {ServiceView} options.service
 * @param {Calibration} options.calibration
 * @param {string[]} options.months
 * @param {string} options.to - the last day the run reached
 * @returns {SummarySection[]}
 */
function uploadSections({
  population,
  executed,
  streams,
  cancelledOn,
  service,
  calibration,
  months,
  to
}) {
  const planned = registrationsOf(population)
  const uploads = executed.filter(
    /** @returns {event is UploadEvent} */
    (event) =>
      event.type === EVENT.SUMMARY_LOG_UPLOADED &&
      expectedOutcome(event) !== null
  )
  /**
   * The share of a stream's fatal rejections the executor makes: the kinds
   * the route can express that the stream has a row to plant on. A removed
   * row only needs one submitted before; a bad date needs a row the service
   * validates the cells of.
   *
   * @param {boolean} validated - whether the stream has such a worksheet
   */
  const madeFatalShare = (validated) => {
    const { fatal } = calibration.activity.uploadIssueKinds
    const plantable = EXPRESSIBLE_ISSUE_KINDS.filter(
      (kind) => validated || kind === ISSUE_KIND.REMOVED_ROW
    )
    return (
      sum(plantable, (kind) => fatal[kind] ?? 0) /
      sum(Object.values(fatal), (weight) => weight)
    )
  }
  const byStream = new Map(
    [...new Set(streams.values())]
      .sort()
      .map((stream) => [
        stream,
        [...planned.values()].filter(
          ({ registration }) => streams.get(registration.id) === stream
        )
      ])
  )

  /**
   * What one registration's profile expects of it in a month it owes: the
   * uploads that land, and the fatal rejections the executor makes before
   * them. The calendar rejects every upload of a stream with no worksheet
   * the service validates fatally, whatever the profile's fatal share.
   *
   * @param {PlannedOperator} operator
   * @param {PlannedRegistration} registration
   */
  const expected = (operator, registration) => {
    const { uploads: rates, volumeFactor } = operator.profile
    const stream = streams.get(registration.id) ?? ''
    const validated = Object.values(SHEETS[stream] ?? {}).some(
      (sheet) => sheet.contribution !== CONTRIBUTION.NONE
    )
    const landing =
      rates.perReportingPeriod / MONTHS_PER_PERIOD[cadenceOf(registration)]
    const invalid =
      landing *
      rates.rejectionRate *
      rates.extraAttemptsWhenRejected *
      (validated ? rates.fatalShare : 1) *
      madeFatalShare(validated)
    return {
      submitted: landing,
      uploads: landing + invalid,
      invalid,
      amended: rowsPerSubmissionOf(calibration, stream).updated * volumeFactor
    }
  }

  return [...byStream].map(([stream, members]) => {
    const ids = new Set(members.map(({ registration }) => registration.id))
    const own = uploads.filter((upload) => ids.has(upload.registrationId))
    const logs = service.summaryLogs.filter((log) =>
      ids.has(log.registrationId)
    )
    const rows = months.map((month) => {
      const owing = members.filter(({ registration }) =>
        owesMonth(registration, month, cancelledOn, to)
      )
      /** @param {keyof ReturnType<typeof expected>} metric */
      const target = (metric) =>
        sum(
          owing,
          ({ operator, registration }) =>
            expected(operator, registration)[metric]
        )
      const inMonth = own.filter((upload) => monthOf(upload.at) === month)
      /** @param {string} status */
      const logged = (status) =>
        logs.filter(
          (log) => log.status === status && monthOf(log.uploadedAt) === month
        ).length
      const landed = inMonth.filter(
        (upload) => upload.outcome === UPLOAD_OUTCOME.SUBMITTED
      )
      return {
        label: month,
        values: {
          uploads: { generated: inMonth.length, target: target('uploads') },
          invalid: { generated: logged('invalid'), target: target('invalid') },
          submitted: {
            generated: logged('submitted'),
            target: target('submitted')
          },
          'amended rows': {
            generated: sum(
              landed,
              (upload) =>
                (upload.amendments?.count ?? 0) + upload.restated.length
            ),
            target: target('amended')
          }
        }
      }
    })
    return {
      title: `Summary logs a month: ${stream}`,
      source:
        'invalid and submitted from the service per registration; uploads from the journal of what the executor made, which the service list should match; amended rows from the executed plan, which the service does not list',
      metrics: ['uploads', 'invalid', 'submitted', 'amended rows'],
      rows
    }
  })
}

/**
 * The last day of the period a feed row reports, from the label the service
 * gives it.
 *
 * @param {{reportType: string, reportingPeriod: string}} report
 */
function periodEndOf(report) {
  const [label, year] = report.reportingPeriod.split(' ')
  const monthly = report.reportType.toLowerCase() === CADENCE.MONTHLY
  const endMonth = monthly
    ? MONTH_LABELS.indexOf(label) + 1
    : Number(label.slice(1)) * 3
  if (endMonth < 1) {
    throw new Error(`The feed labels a period "${report.reportingPeriod}"`)
  }
  return lastDayOfMonth(Number(year), endMonth)
}

/**
 * The day a report was due: the calibration's due day of the month after
 * its period.
 *
 * @param {string} periodEnd - ISO date
 * @param {number} dueDay
 */
function dueDayOf(periodEnd, dueDay) {
  const [year, month] = periodEnd.split('-').map(Number)
  const dueYear = month === 12 ? year + 1 : year
  const dueMonth = month === 12 ? 1 : month + 1
  return `${dueYear}-${String(dueMonth).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`
}

/**
 * How the estate's reports landed against their due day, over the periods
 * settled enough for every late return the calendar plans to have arrived.
 *
 * The feed lists a period for every registration it can report on, from the
 * start of the year where the registration holds no active accreditation,
 * and at the cadence its accreditation stands at today. Only the periods the
 * calendar planned a return for count: at the registration's planned
 * cadence, ending on or after the day it went active and before the day its
 * accreditation was cancelled.
 *
 * @param {Object} options
 * @param {PlannedPopulation} options.population
 * @param {Map<string, string>} options.numbers - registration number to planned registration id
 * @param {Map<string, string>} options.cancelledOn
 * @param {ServiceView} options.service
 * @param {Calibration} options.calibration
 * @param {string} options.from - the first day of the run
 * @param {string} options.to - the last day the run reached
 * @returns {SummarySection[]}
 */
function reportSections({
  population,
  numbers,
  cancelledOn,
  service,
  calibration,
  from,
  to
}) {
  const planned = registrationsOf(population)
  const { dueDay } = calibration.punctuality
  const reports = service.reports
    .map((report) => ({
      ...report,
      periodEnd: periodEndOf(report),
      planned: planned.get(numbers.get(report.registrationNumber) ?? '')
    }))
    .filter(({ reportType, periodEnd, planned }) => {
      if (!planned) return false
      const { registration } = planned
      const cancelled = cancelledOn.get(registration.id)?.slice(0, 10)
      return (
        periodEnd.startsWith(service.feedYear) &&
        reportType.toLowerCase() === cadenceOf(registration) &&
        periodEnd >= later(registration.activeFrom, from) &&
        periodEnd <= validUntil(registration, to) &&
        (cancelled === undefined || periodEnd < cancelled)
      )
    })
    .map((report) => ({
      ...report,
      due: dueDayOf(report.periodEnd, dueDay),
      profile: report.planned?.operator.profile.reporting
    }))
  const settled = reports.filter(
    (report) => addDays(report.due, LATEST_RETURN_DAYS_AFTER_DUE) <= to
  )
  const first = settled.filter(
    /** @returns {report is (typeof report) & {submittedDate: string}} */
    (report) => report.submissionNumber === 1 && report.submittedDate !== null
  )
  const missed = settled.filter((report) => report.submittedDate === null)
  const owed = first.length + missed.length

  /** @param {{due: string, submittedDate: string}} report */
  const lateness = (report) => daysBetween(report.due, report.submittedDate)
  const buckets = tally(first, (report) => {
    const late = lateness(report)
    if (late <= 0) return 'on time'
    if (late <= 7) return 'late within 7 days'
    if (late <= 30) return 'late within 30 days'
    return 'late beyond 30 days'
  })
  /** @param {keyof BehaviourProfile['reporting']} rate */
  const profileMean = (rate) =>
    mean(first, (report) => report.profile?.[rate] ?? 0)
  const onTime = first.filter((report) => lateness(report) <= 0)

  /** @param {number} count @param {number} of */
  const shareOf = (count, of) => (of === 0 ? 0 : count / of)
  /**
   * @param {string} label
   * @param {number} generated
   * @param {number} target
   * @returns {SummaryRow}
   */
  const share = (label, generated, target) => ({
    label,
    values: { share: { generated, target } }
  })
  return [
    {
      title: 'Reports against their due day',
      source: `the service's report submissions feed, over the ${owed} periods due ${LATEST_RETURN_DAYS_AFTER_DUE} or more days before ${to}`,
      metrics: ['share'],
      rows: [
        ...LATENESS_BUCKETS.map(([label, rate]) =>
          share(
            label,
            shareOf(buckets[label] ?? 0, first.length),
            profileMean(rate)
          )
        ),
        share(
          `on time and more than ${EARLY_DAYS_BEFORE_DUE} days early`,
          shareOf(
            onTime.filter((report) => lateness(report) < -EARLY_DAYS_BEFORE_DUE)
              .length,
            onTime.length
          ),
          mean(onTime, (report) => report.profile?.earlyShare ?? 0)
        ),
        share(
          'missed',
          shareOf(missed.length, owed),
          mean(
            [...first, ...missed],
            (report) => report.profile?.missedReturnRate ?? 0
          )
        ),
        share(
          'resubmitted',
          shareOf(
            settled.filter((report) => report.submissionNumber === 2).length,
            first.length
          ),
          profileMean('restatementRate')
        )
      ]
    }
  ]
}

/**
 * The months an accredited registration could draft notes in, as the
 * calendar plans them: from the month of the day after its first submitted
 * summary log, which is given a whole month's notes however late in it that
 * day falls, to the month of the last day its accreditation was valid, or of
 * the day before it was suspended or cancelled.
 *
 * @param {PlannedRegistration} registration
 * @param {CalendarEvent[]} executed
 * @param {string[]} months
 * @param {string} to - the last day the run reached
 * @returns {Set<string>}
 */
function issuingMonths(registration, executed, months, to) {
  const own = executed.filter(
    (event) => event.registrationId === registration.id
  )
  const first = own.find(
    (event) =>
      event.type === EVENT.SUMMARY_LOG_UPLOADED &&
      event.outcome === UPLOAD_OUTCOME.SUBMITTED
  )
  const ended = own.find(
    (event) =>
      event.type === EVENT.ACCREDITATION_SUSPENDED ||
      event.type === EVENT.ACCREDITATION_CANCELLED
  )
  if (!first || !registration.accreditation) {
    return new Set()
  }
  const firstMonth = monthOf(addDays(first.at.slice(0, 10), 1))
  const lastMonth = monthOf(
    ended ? addDays(ended.at.slice(0, 10), -1) : validUntil(registration, to)
  )
  return new Set(
    months.filter((month) => month >= firstMonth && month <= lastMonth)
  )
}

/**
 * Notes drafted and moved along the lifecycle, against the rate per
 * accreditation and the transition rates each operator's profile carries.
 *
 * @param {Object} options
 * @param {PlannedPopulation} options.population
 * @param {CalendarEvent[]} options.executed
 * @param {Map<string, string>} options.accreditationNumbers - accreditation number to planned registration id
 * @param {ServiceView} options.service
 * @param {Calibration} options.calibration
 * @param {string[]} options.months
 * @param {string} options.to - the last day the run reached
 * @returns {SummarySection[]}
 */
function noteSections({
  population,
  executed,
  accreditationNumbers,
  service,
  calibration,
  months,
  to
}) {
  const planned = registrationsOf(population)
  const rate = calibration.activity.prnsPerAccreditationPerMonth
  const accredited = [...planned.values()].filter(
    ({ registration }) => registration.accreditation
  )
  const issuing = new Map(
    accredited.map(({ registration }) => [
      registration.id,
      issuingMonths(registration, executed, months, to)
    ])
  )

  /**
   * What one registration's profile expects of its notes in a month.
   *
   * @param {PlannedOperator} operator
   * @returns {Record<'drafted' | NoteTransition, number>}
   */
  const expected = ({ profile }) => {
    const drafted = rate * profile.volumeFactor
    const raised = drafted * (1 - profile.prn.discardRate)
    const issued = raised * (1 - profile.prn.deleteRate)
    const requested = issued * profile.prn.cancelRate
    return {
      drafted,
      raised,
      issued,
      accepted: (issued - requested) * profile.prn.producerAcceptRate,
      deleted: raised * profile.prn.deleteRate,
      discarded: drafted * profile.prn.discardRate,
      'cancellation requested': requested,
      cancelled: requested
    }
  }
  const ownNotes = service.notes.filter((note) =>
    accreditationNumbers.has(note.accreditationNumber)
  )
  const ownTransitions = service.noteTransitions.filter((transition) =>
    accreditationNumbers.has(transition.accreditationNumber)
  )
  /** @param {{from: string, to: string}} transition */
  const transitionOf = (transition) =>
    NOTE_TRANSITIONS.find(
      ({ from, to }) => transition.from === from && transition.to === to
    )?.metric ?? null

  const byMonth = months.map((month) => {
    const active = accredited.filter(({ registration }) =>
      issuing.get(registration.id)?.has(month)
    )
    /** @param {keyof ReturnType<typeof expected>} metric */
    const target = (metric) =>
      sum(active, ({ operator }) => expected(operator)[metric])
    const transitions = tally(
      ownTransitions.filter((transition) => monthOf(transition.at) === month),
      transitionOf
    )
    return {
      label: month,
      values: {
        drafted: {
          generated: ownNotes.filter(
            (note) => monthOf(note.createdAt) === month
          ).length,
          target: target('drafted')
        },
        ...Object.fromEntries(
          NOTE_TRANSITIONS.map(({ metric }) => [
            metric,
            { generated: transitions[metric] ?? 0, target: target(metric) }
          ])
        )
      }
    }
  })

  /** @param {{registration: PlannedRegistration}} member */
  const materialKey = ({ registration }) =>
    `${registration.processingType === 'exporter' ? 'export' : 'reprocess'} ${registration.material.suffix}`
  /** @param {{accreditationNumber: string}} record */
  const keyOf = ({ accreditationNumber }) => {
    const member = planned.get(
      accreditationNumbers.get(accreditationNumber) ?? ''
    )
    return member ? materialKey(member) : null
  }
  const byMaterial = [...new Set(accredited.map(materialKey))]
    .sort()
    .map((key) => {
      const members = accredited.filter((member) => materialKey(member) === key)
      /** @param {keyof ReturnType<typeof expected>} metric */
      const target = (metric) =>
        sum(
          members,
          ({ operator, registration }) =>
            expected(operator)[metric] *
            (issuing.get(registration.id)?.size ?? 0)
        )
      const transitions = tally(
        ownTransitions.filter((transition) => keyOf(transition) === key),
        transitionOf
      )
      return {
        label: key,
        values: {
          drafted: {
            generated: ownNotes.filter((note) => keyOf(note) === key).length,
            target: target('drafted')
          },
          issued: {
            generated: transitions.issued ?? 0,
            target: target('issued')
          },
          accepted: {
            generated: transitions.accepted ?? 0,
            target: target('accepted')
          }
        }
      }
    })

  return [
    {
      title: 'Notes a month',
      source:
        'drafted from the admin list of notes; transitions from the system log of status changes',
      metrics: ['drafted', ...NOTE_TRANSITIONS.map(({ metric }) => metric)],
      rows: byMonth
    },
    {
      title: 'Notes by material and export flag, over the run',
      source: 'the admin list and the system log, as above',
      metrics: ['drafted', 'issued', 'accepted'],
      rows: byMaterial
    }
  ]
}

/**
 * The last day the run reached: the day of its last executed event, so a run
 * summarised part way through is measured over the months it has run, and a
 * complete one over the whole period.
 *
 * @param {CalendarEvent[]} executed - in order
 * @param {Pick<RunSettings, 'from'>} settings
 */
export function reachedDay(executed, settings) {
  const last = executed[executed.length - 1]
  return last ? last.at.slice(0, 10) : settings.from
}

/**
 * Every section of the summary.
 *
 * @param {Object} options
 * @param {RunSettings} options.settings
 * @param {Calibration} options.calibration
 * @param {PlannedPopulation} options.population
 * @param {{registrations: {registrationId: string, stream: string}[]}} options.rows - the planned rows, for each registration's stream
 * @param {CalendarEvent[]} options.events - the whole plan, in order
 * @param {Set<string>} options.done - keys of the events executed
 * @param {Run} options.run - what the service holds, by the numbers it gave
 * @param {ServiceView} options.service
 * @returns {SummarySection[]}
 */
export function measure({
  settings,
  calibration,
  population,
  rows,
  events,
  done,
  run,
  service
}) {
  const executed = events.filter((event) => done.has(eventKey(event)))
  const reached = reachedDay(executed, settings)
  const months = monthsBetween(settings.from, reached)
  const streams = new Map(
    rows.registrations.map(({ registrationId, stream }) => [
      registrationId,
      stream
    ])
  )
  const cancelledOn = new Map(
    executed
      .filter((event) => event.type === EVENT.ACCREDITATION_CANCELLED)
      .map((event) => [event.registrationId, event.at])
  )
  const registrations = [...run.operators.values()].flatMap((operator) => [
    ...operator.registrations.values()
  ])
  const numbers = new Map(
    registrations.map(({ regNumber, planned }) => [regNumber, planned.id])
  )
  const accreditationNumbers = new Map(
    registrations.flatMap(({ accNumber, planned }) =>
      accNumber === undefined ? [] : [[accNumber, planned.id]]
    )
  )

  return [
    ...estateSections(service, calibration, settings.scale),
    ...uploadSections({
      population,
      executed,
      streams,
      cancelledOn,
      service,
      calibration,
      months,
      to: reached
    }),
    ...reportSections({
      population,
      numbers,
      cancelledOn,
      service,
      calibration,
      from: settings.from,
      to: reached
    }),
    ...noteSections({
      population,
      executed,
      accreditationNumbers,
      service,
      calibration,
      months,
      to: reached
    })
  ]
}

/**
 * The summary as text: one table per section, each metric as generated,
 * target and their ratio.
 *
 * @param {SummarySection[]} sections
 * @returns {string}
 */
export function format(sections) {
  /** @param {number} value */
  const number = (value) =>
    Number.isInteger(value) ? String(value) : value.toFixed(2)
  /** @param {Measure} measure */
  const ratio = ({ generated, target }) => {
    if (target === 0) return generated === 0 ? '' : '∞'
    return (generated / target).toFixed(2)
  }
  return sections
    .map((section) => {
      const header = [
        '',
        ...section.metrics.flatMap((metric) => [metric, 'target', 'ratio'])
      ]
      const lines = section.rows.map((row) => [
        row.label,
        ...section.metrics.flatMap((metric) => {
          const measure = row.values[metric]
          return [
            number(measure.generated),
            number(measure.target),
            ratio(measure)
          ]
        })
      ])
      const widths = header.map((_, column) =>
        Math.max(...[header, ...lines].map((line) => line[column].length))
      )
      /** @param {string[]} line */
      const render = (line) =>
        line
          .map((cell, column) =>
            column === 0
              ? cell.padEnd(widths[column])
              : cell.padStart(widths[column])
          )
          .join('  ')
      return [
        `## ${section.title}`,
        `Generated from ${section.source}.`,
        '',
        render(header),
        ...lines.map(render)
      ].join('\n')
    })
    .join('\n\n')
}
