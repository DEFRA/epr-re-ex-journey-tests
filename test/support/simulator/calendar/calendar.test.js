import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { DEFAULT_CALIBRATION } from '../population/calibration.js'
import { planPopulation } from '../population/population.js'
import { planSummaryLogRows } from '../rows/rows.js'
import { cadenceAt, planCalendar, uploadRows } from './calendar.js'
import {
  CADENCE,
  EVENT,
  ISSUE_KIND,
  ISSUE_SEVERITY,
  UPLOAD_OUTCOME
} from './events.js'

/** @import {CalendarEvent, UploadEvent, ReportEvent, PrnEvent} from './events.js' */
/** @import {PlannedRegistration} from '../population/population.js' */
/** @import {PlannedLogRow, PlannedRegistrationRows} from '../rows/rows.js' */

/**
 * A whole year, so every period the rows plan covers has closed and every late
 * return has arrived, which is what makes punctuality measurable. The research
 * this is calibrated against measured April to July; the assertions below take
 * the first half of the year for the same reason it did, to keep clear of the
 * months still being filed at the snapshot.
 */
const TO = '2026-12-31'
const MEASURED_UNTIL = '2026-06-30'

const population = planPopulation({ seed: 'calendar' })
const rows = planSummaryLogRows({ population })
const calendar = planCalendar({ population, rows, to: TO })

const { punctuality: PUNCTUALITY, activity: ACTIVITY } = DEFAULT_CALIBRATION

/**
 * @template T
 * @param {T | undefined | null} value
 * @returns {T}
 */
const must = (value) => {
  assert.ok(value !== undefined && value !== null)
  return value
}

const registrations = population.organisations.flatMap(
  (operator) => operator.registrations
)
/** @param {{registrationId?: string}} event */
const registrationOf = (event) =>
  must(
    registrations.find(
      (registration) => registration.id === event.registrationId
    )
  )
/** @param {{organisationId: string}} event */
const operatorOf = (event) =>
  must(
    population.organisations.find(
      (operator) => operator.id === event.organisationId
    )
  )
/** @param {string} registrationId */
const rowsOf = (registrationId) =>
  must(
    rows.registrations.find(
      (planned) => planned.registrationId === registrationId
    )
  )
const events = calendar.operators.flatMap((operator) => operator.events)

/**
 * The member of the event union that carries a `type`. Distributes over the
 * union, so a member whose `type` is itself a union of several matches each.
 *
 * @template E
 * @template T
 * @typedef {E extends {type: infer U} ? (T extends U ? E : never) : never} Carrying
 */
/**
 * @template {CalendarEvent['type']} T
 * @typedef {Carrying<CalendarEvent, T>} EventOf
 */

/**
 * @template {CalendarEvent['type']} T
 * @param {CalendarEvent[]} list
 * @param {T} type
 * @returns {EventOf<T>[]}
 */
const eventsOfType = (list, type) =>
  list.filter(
    /** @returns {event is EventOf<T>} */
    (event) => event.type === type
  )
/**
 * @template {CalendarEvent['type']} T
 * @param {T} type
 */
const ofType = (type) => eventsOfType(events, type)
/**
 * @param {CalendarEvent} event
 * @returns {event is PrnEvent}
 */
const isPrnEvent = (event) => event.type.startsWith('prn.')

const uploads = ofType(EVENT.SUMMARY_LOG_UPLOADED)
const landed = uploads.filter(
  (upload) => upload.outcome === UPLOAD_OUTCOME.SUBMITTED
)
const reports = ofType(EVENT.REPORT_SUBMITTED)
const prnEvents = events.filter(isPrnEvent)

/**
 * @param {number} actual
 * @param {number} target
 * @param {number} tolerance
 * @param {string} [of]
 */
const near = (actual, target, tolerance, of = '') =>
  assert.ok(
    Math.abs(actual - target) <= tolerance,
    `${of} ${actual} is not within ${tolerance} of ${target}`.trim()
  )

/**
 * @template T
 * @param {T[]} members
 * @param {(member: T) => boolean} predicate
 */
const share = (members, predicate) =>
  members.filter(predicate).length / members.length

/** @param {number[]} values */
const mean = (values) =>
  values.reduce((sum, value) => sum + value, 0) / values.length

/**
 * @template T
 * @param {T[]} members
 * @param {(member: T) => string} read
 */
const tally = (members, read) => {
  /** @type {Record<string, number>} */
  const counts = {}
  for (const member of members) {
    const key = read(member)
    counts[key] = (counts[key] ?? 0) + 1
  }
  return counts
}

/** @param {{at: string}} event */
const day = (event) => event.at.slice(0, 10)
/** @param {{at: string}} event */
const month = (event) => event.at.slice(0, 7)
/** @param {{at: string}} event */
const isWeekend = (event) => [0, 6].includes(new Date(event.at).getUTCDay())
/** @param {string} from @param {string} to */
const daysBetween = (from, to) =>
  Math.round((Date.parse(to) - Date.parse(from)) / 86400000)

/** @param {string} registrationId */
const uploadsOf = (registrationId) =>
  uploads.filter((upload) => upload.registrationId === registrationId)

/** @param {{worksheet: string, rowId: number}} row */
const rowKey = (row) => `${row.worksheet}/${row.rowId}`

/** @param {PlannedLogRow[]} view */
const byKey = (view) => new Map(view.map((row) => [rowKey(row), row]))

/**
 * @param {PlannedRegistrationRows} registration
 * @param {UploadEvent} upload
 */
const viewOf = (registration, upload) => {
  const sequence = uploadsOf(registration.registrationId)
  return uploadRows({
    registration,
    uploads: sequence.slice(0, sequence.indexOf(upload) + 1)
  })
}

/**
 * The last day of a report's period, and the day it was due.
 *
 * @param {ReportEvent} report
 */
function periodBounds(report) {
  const months = report.cadence === CADENCE.MONTHLY ? 1 : 3
  const endMonth = report.period * months
  const end = new Date(Date.UTC(report.year, endMonth, 0))
  const due = new Date(Date.UTC(report.year, endMonth, PUNCTUALITY.dueDay))
  return {
    end: end.toISOString().slice(0, 10),
    due: due.toISOString().slice(0, 10)
  }
}

/**
 * Months a registration was active for, up to and including December.
 *
 * @param {PlannedRegistration} registration
 */
const activeMonths = (registration) =>
  13 - Number(registration.activeFrom.slice(5, 7))

describe('the calendar at full scale', () => {
  it('plans every operator, with events in the order they happen', () => {
    assert.deepEqual(
      calendar.operators.map((operator) => operator.organisationId),
      population.organisations.map((operator) => operator.id)
    )
    for (const { events } of calendar.operators) {
      for (let index = 1; index < events.length; index++) {
        assert.ok(events[index - 1].at <= events[index].at)
      }
    }
  })

  it('emits only the enumerated event types, and every one of them', () => {
    const emitted = new Set(events.map((event) => event.type))
    assert.deepEqual([...emitted].sort(), Object.values(EVENT).sort())
  })

  it('keeps every event inside the period and inside working hours', () => {
    for (const event of events) {
      assert.ok(day(event) >= calendar.from && day(event) <= TO, event.at)
      const hour = new Date(event.at).getUTCHours()
      assert.ok(hour >= 8 && hour <= 17, event.at)
    }
  })

  it('never has one registration do two things at the same moment', () => {
    for (const { events } of calendar.operators) {
      const seen = new Set()
      for (const event of events) {
        const key = `${event.registrationId}/${event.at}`
        assert.ok(!seen.has(key), key)
        seen.add(key)
      }
    }
  })

  it('records the settings it was planned with', () => {
    assert.equal(calendar.from, DEFAULT_CALIBRATION.register.activeFrom.goLive)
    assert.equal(calendar.to, TO)
    assert.ok(calendar.seed.startsWith(`${population.seed}/`))
  })
})

describe('registrations and their accreditations', () => {
  const changed = [
    ...ofType(EVENT.ACCREDITATION_SUSPENDED),
    ...ofType(EVENT.ACCREDITATION_CANCELLED)
  ]

  it('approves every registration once, on the day it went active', () => {
    const approved = ofType(EVENT.REGISTRATION_APPROVED)
    assert.equal(approved.length, registrations.length)
    for (const event of approved) {
      assert.equal(day(event), registrationOf(event).activeFrom)
    }
  })

  it('suspends or cancels exactly the accreditations the population ended that way', () => {
    assert.deepEqual(
      tally(
        changed,
        (event) => must(registrationOf(event).accreditation).status
      ),
      { suspended: 2, cancelled: 2 }
    )
    for (const event of changed) {
      const statusEvents = events.filter(
        (other) =>
          other.registrationId === event.registrationId &&
          other.type.startsWith('accreditation.')
      )
      assert.equal(statusEvents.length, 1)
    }
  })

  it('stops a registration doing anything once its accreditation is suspended or cancelled', () => {
    for (const change of changed) {
      const after = events.filter(
        (event) =>
          event.registrationId === change.registrationId && event.at > change.at
      )
      assert.deepEqual(after, [])
      const before = events.filter(
        (event) =>
          event.registrationId === change.registrationId &&
          event.type !== EVENT.REGISTRATION_APPROVED &&
          event.at < change.at
      )
      assert.ok(before.length > 0, `${change.registrationId} did nothing first`)
    }
  })

  it('dates a status change on a working day', () => {
    for (const event of changed) assert.ok(!isWeekend(event), event.at)
  })

  it('leaves a status change unplanned rather than put it on a weekend', () => {
    const sunday = '2026-01-04'
    const planned = planCalendar({ population, rows, to: sunday })
    const changes = planned.operators
      .flatMap((operator) => operator.events)
      .filter((event) => event.type.startsWith('accreditation.'))
    assert.deepEqual(changes, [])
  })
})

describe('summary log uploads', () => {
  it('uploads each accredited registration a month about as often as the profile says', () => {
    const accredited = registrations.filter(
      (registration) =>
        registration.accreditation?.status === 'approved' &&
        registration.activeFrom <= '2026-01-31'
    )
    near(
      mean(
        accredited.map(
          (registration) =>
            landed.filter((upload) => upload.registrationId === registration.id)
              .length / 12
        )
      ),
      ACTIVITY.uploads.perReportingPeriod,
      0.15,
      'uploads per month'
    )
  })

  it('carries every upload to its own day, and no earlier than the one before', () => {
    for (const registration of registrations) {
      let cutoff = ''
      for (const upload of uploadsOf(registration.id)) {
        assert.equal(upload.cutoff, day(upload))
        assert.ok(upload.cutoff >= cutoff)
        cutoff = upload.cutoff
      }
    }
  })

  it('closes every reported period with a submitted upload before the report', () => {
    for (const report of reports.filter(
      (report) => report.submissionNumber === 1
    )) {
      const { end } = periodBounds(report)
      const closing = landed.find(
        (upload) =>
          upload.registrationId === report.registrationId &&
          upload.cutoff > end &&
          upload.at < report.at
      )
      assert.ok(
        closing,
        `${report.registrationId} reported ${report.year}/${report.period} before uploading it`
      )
    }
  })

  /**
   * @param {UploadEvent} upload
   * @param {UploadEvent['outcome']} outcome
   */
  const attemptsBefore = (upload, outcome) =>
    uploads.some(
      (other) =>
        other.registrationId === upload.registrationId &&
        other.cutoff === upload.cutoff &&
        other.outcome === outcome
    )

  it('has uploads come back with issues at the calibrated rate', () => {
    near(
      share(landed, (upload) =>
        attemptsBefore(upload, UPLOAD_OUTCOME.REJECTED)
      ),
      ACTIVITY.uploads.rejectionRate,
      0.02,
      'rejection rate'
    )
  })

  it('has drafts abandoned at the calibrated rate', () => {
    near(
      share(landed, (upload) =>
        attemptsBefore(upload, UPLOAD_OUTCOME.ABANDONED)
      ),
      ACTIVITY.uploads.abandonRate,
      0.01,
      'abandon rate'
    )
  })

  /**
   * A tardy operator is rejected more often and more fatally than a punctual
   * one, so across rejections the fatal share is weighted towards it. What the
   * calendar owes is a draw against each operator's own profile, so that is the
   * expectation: the mean of the profile rate over the uploads it applies to.
   */
  it('makes each rejection fatal at its operator’s own rate, of the kinds the calibration names', () => {
    const rejected = uploads.filter(
      (upload) => upload.outcome === UPLOAD_OUTCOME.REJECTED
    )
    near(
      share(
        rejected,
        (upload) => must(upload.issues).severity === ISSUE_SEVERITY.FATAL
      ),
      mean(
        rejected.map((upload) => operatorOf(upload).profile.uploads.fatalShare)
      ),
      0.02,
      'fatal share'
    )
    const kinds = tally(rejected, (upload) => must(upload.issues).kind)
    assert.deepEqual(
      Object.keys(kinds).sort(),
      Object.values(ISSUE_KIND).sort()
    )
    assert.ok(kinds.blankField > kinds.badDate)
    assert.ok(kinds.removedRow > kinds.unreadable)
  })

  it('leaves the landing upload of every attempt clean', () => {
    for (const upload of landed) assert.equal(upload.issues, null)
  })

  it('plants a removed row only where the row was submitted before', () => {
    for (const upload of uploads.filter(
      (upload) => upload.issues?.kind === ISSUE_KIND.REMOVED_ROW
    )) {
      const before = landed.filter(
        (other) =>
          other.registrationId === upload.registrationId && other.at < upload.at
      )
      assert.ok(before.length > 0)
      const submitted = byKey(
        rowsOf(upload.registrationId).rows.filter(
          (row) => row.date <= before[before.length - 1].cutoff
        )
      )
      for (const ref of must(upload.issues).rows) {
        assert.ok(submitted.has(rowKey(ref)))
      }
    }
  })
})

describe('the rows an upload carries', () => {
  const registration = must(
    rows.registrations.find(
      (planned) =>
        planned.stream === 'exporter' &&
        uploadsOf(planned.registrationId).filter(
          (upload) => upload.outcome === UPLOAD_OUTCOME.SUBMITTED
        ).length > 4
    )
  )
  const submitted = uploadsOf(registration.registrationId).filter(
    (upload) => upload.outcome === UPLOAD_OUTCOME.SUBMITTED
  )

  it('carries every row dated up to the cutoff and nothing later', () => {
    for (const upload of submitted) {
      assert.deepEqual(
        viewOf(registration, upload).map((row) => row.rowId),
        registration.rows
          .filter((row) => row.date <= upload.cutoff)
          .map((row) => row.rowId)
      )
    }
  })

  it('restates exactly the amended rows between one upload and the next', () => {
    const previous = byKey(viewOf(registration, submitted[1]))
    const upload = submitted[2]
    const changed = viewOf(registration, upload).filter((row) => {
      const kept = previous.get(rowKey(row))
      return kept && kept.seed !== row.seed
    })
    assert.equal(
      changed.length,
      must(upload.amendments).count + upload.restated.length
    )
    for (const row of changed) {
      const kept = must(previous.get(rowKey(row)))
      assert.deepEqual({ ...row, seed: kept.seed }, kept)
    }
  })

  it('never lets an amended row revert to the row as planned', () => {
    const planned = byKey(registration.rows)
    const amended = [...byKey(viewOf(registration, submitted[2]))].filter(
      ([key, row]) => must(planned.get(key)).seed !== row.seed
    )
    assert.ok(amended.length > 0)
    for (const upload of submitted.slice(3)) {
      const view = byKey(viewOf(registration, upload))
      for (const [key] of amended) {
        assert.notEqual(must(view.get(key)).seed, must(planned.get(key)).seed)
      }
    }
  })

  it('plans no more amendments than the open periods hold rows', () => {
    for (const planned of rows.registrations) {
      let cutoff = ''
      for (const upload of uploadsOf(planned.registrationId)) {
        const pool = planned.rows.filter(
          (row) =>
            row.date <= cutoff && !upload.closedPeriods.includes(row.period)
        )
        if (upload.amendments) {
          assert.ok(
            upload.amendments.count <= pool.length,
            `${planned.registrationId} ${upload.at} plans ${upload.amendments.count} amendments over ${pool.length} rows`
          )
        }
        if (upload.outcome === UPLOAD_OUTCOME.SUBMITTED) cutoff = upload.cutoff
      }
    }
  })

  it('amends only rows in periods still open, unless it restates a closed one', () => {
    const sampled = rows.registrations.filter((_, index) => index % 4 === 0)
    for (const planned of sampled) {
      let previous = new Map()
      for (const upload of uploadsOf(planned.registrationId)) {
        if (upload.outcome !== UPLOAD_OUTCOME.SUBMITTED) continue
        const view = byKey(viewOf(planned, upload))
        const restated = new Set(upload.restated.map(rowKey))
        for (const [key, row] of view) {
          const kept = previous.get(key)
          if (!kept || kept.seed === row.seed || restated.has(key)) continue
          assert.ok(
            !upload.closedPeriods.includes(row.period),
            `${planned.registrationId} amended ${key} in closed period ${row.period}`
          )
        }
        previous = view
      }
    }
  })

  it('blanks or spoils the date of the rows an error is planted on', () => {
    for (const kind of [ISSUE_KIND.BLANK_FIELD, ISSUE_KIND.BAD_DATE]) {
      const upload = must(
        uploads.find((upload) => upload.issues?.kind === kind)
      )
      const view = byKey(viewOf(rowsOf(upload.registrationId), upload))
      for (const ref of must(upload.issues).rows) {
        const spoiled = Object.entries(
          must(view.get(rowKey(ref))).fields
        ).filter(
          ([marker, value]) =>
            /^(DATE|MONTH)_/.test(marker) &&
            value === (kind === ISSUE_KIND.BLANK_FIELD ? '' : 'not a date')
        )
        assert.ok(spoiled.length >= 1, `${kind} on ${ref.rowId}`)
      }
    }
  })

  it('omits the rows a removed-row rejection names', () => {
    const upload = must(
      uploads.find((upload) => upload.issues?.kind === ISSUE_KIND.REMOVED_ROW)
    )
    const planned = rowsOf(upload.registrationId)
    const view = byKey(viewOf(planned, upload))
    const removed = must(upload.issues).rows
    for (const ref of removed) assert.ok(!view.has(rowKey(ref)))
    assert.equal(
      view.size,
      planned.rows.filter((row) => row.date <= upload.cutoff).length -
        removed.length
    )
  })

  it('refuses to render nothing', () => {
    assert.throws(() => uploadRows({ registration, uploads: [] }), /No upload/)
  })
})

describe('reports', () => {
  const measured = reports.filter(
    (report) =>
      report.submissionNumber === 1 &&
      periodBounds(report).end <= MEASURED_UNTIL &&
      registrationOf(report).accreditation?.status === 'approved'
  )
  /** @param {ReportEvent} report */
  const lateness = (report) =>
    daysBetween(periodBounds(report).due, day(report))

  it('files monthly reports for accredited registrations and quarterly ones otherwise', () => {
    for (const report of reports) {
      assert.equal(
        report.cadence,
        registrationOf(report).accreditation
          ? CADENCE.MONTHLY
          : CADENCE.QUARTERLY
      )
    }
    assert.ok(reports.some((report) => report.cadence === CADENCE.QUARTERLY))
  })

  it('files each period at most once per submission number', () => {
    const seen = new Set()
    for (const report of reports) {
      const key = `${report.registrationId}/${report.year}/${report.cadence}/${report.period}/${report.submissionNumber}`
      assert.ok(!seen.has(key), key)
      seen.add(key)
    }
  })

  it('reproduces the calibrated punctuality of the estate', () => {
    const buckets = tally(measured, (report) => {
      const late = lateness(report)
      if (late <= 0) return 'onTime'
      if (late <= 7) return 'lateWithin7'
      if (late <= 30) return 'lateWithin30'
      return 'lateBeyond30'
    })
    const total =
      PUNCTUALITY.onTime +
      PUNCTUALITY.lateWithin7 +
      PUNCTUALITY.lateWithin30 +
      PUNCTUALITY.lateBeyond30
    for (const bucket of [
      'onTime',
      'lateWithin7',
      'lateWithin30',
      'lateBeyond30'
    ]) {
      near(
        (buckets[bucket] ?? 0) / measured.length,
        PUNCTUALITY[bucket] / total,
        0.02,
        bucket
      )
    }
  })

  it('files the calibrated share of on-time returns more than ten days early', () => {
    const onTime = measured.filter((report) => lateness(report) <= 0)
    near(
      share(onTime, (report) => lateness(report) < -10),
      PUNCTUALITY.earlyShare,
      0.03,
      'early share'
    )
  })

  it('misses returns at the calibrated rate', () => {
    const owed = registrations
      .filter(
        (registration) =>
          registration.accreditation?.status === 'approved' &&
          registration.activeFrom <= MEASURED_UNTIL
      )
      .reduce(
        (sum, registration) =>
          sum + 7 - Number(registration.activeFrom.slice(5, 7)),
        0
      )
    near(1 - measured.length / owed, ACTIVITY.missedReturnRate, 0.01, 'missed')
  })

  it('resubmits a period only after an upload restated it', () => {
    for (const report of reports.filter(
      (report) => report.submissionNumber > 1
    )) {
      const { end } = periodBounds(report)
      const planned = rowsOf(report.registrationId)
      const restating = uploads.find(
        (upload) =>
          upload.registrationId === report.registrationId &&
          upload.at < report.at &&
          upload.restated.some((ref) => {
            const row = must(
              planned.rows.find((row) => rowKey(row) === rowKey(ref))
            )
            return row.date <= end && upload.closedPeriods.includes(row.period)
          })
      )
      assert.ok(
        restating,
        `${report.registrationId} resubmitted ${report.period} unprompted`
      )
    }
  })

  it('restates closed periods at the calibrated rate', () => {
    const restatable = measured.filter(
      (report) => periodBounds(report).end <= '2026-04-30'
    )
    near(
      share(restatable, (report) =>
        reports.some(
          (other) =>
            other.submissionNumber > 1 &&
            other.registrationId === report.registrationId &&
            other.year === report.year &&
            other.period === report.period
        )
      ),
      ACTIVITY.restatementRate,
      0.02,
      'restatement rate'
    )
  })
})

describe('PRNs', () => {
  const accredited = registrations.filter(
    (registration) => registration.accreditation?.status === 'approved'
  )
  const drafted = ofType(EVENT.PRN_DRAFTED)
  /** @type {Map<string, PrnEvent[]>} */
  const byPrn = new Map()
  for (const event of prnEvents) {
    byPrn.set(event.prnId, [...(byPrn.get(event.prnId) ?? []), event])
  }
  /** @param {PlannedRegistration} registration */
  const volumeOf = (registration) =>
    must(
      population.organisations.find(
        (operator) => operator.id === registration.organisationId
      )
    ).profile.volumeFactor

  /**
   * The calibrated rate is per accreditation before the operator's volume
   * factor, and that factor averages one over operators rather than over
   * registrations, so the expectation is the rate scaled by each
   * registration's own factor over the months it was live.
   */
  /** @param {PlannedRegistration[]} members */
  const expectedPerMonth = (members) =>
    (ACTIVITY.prnsPerAccreditationPerMonth *
      members.reduce(
        (sum, registration) =>
          sum + volumeOf(registration) * activeMonths(registration),
        0
      )) /
    members.reduce((sum, registration) => sum + activeMonths(registration), 0)
  /** @param {PlannedRegistration[]} members */
  const draftedPerMonth = (members) =>
    drafted.filter((event) =>
      members.some((registration) => registration.id === event.registrationId)
    ).length /
    members.reduce((sum, registration) => sum + activeMonths(registration), 0)

  it('raises the calibrated number a month per accreditation', () => {
    near(
      draftedPerMonth(accredited),
      expectedPerMonth(accredited),
      0.05,
      'PRNs per accreditation month'
    )
  })

  it('raises them for every accredited material at that material’s rate', () => {
    const suffixes = [
      ...new Set(accredited.map((registration) => registration.material.suffix))
    ]
    assert.deepEqual(
      Object.keys(
        tally(drafted, (event) => registrationOf(event).material.suffix)
      ).sort(),
      suffixes.sort()
    )
    for (const suffix of suffixes) {
      const members = accredited.filter(
        (registration) => registration.material.suffix === suffix
      )
      if (members.length < 10) continue
      near(draftedPerMonth(members), expectedPerMonth(members), 0.25, suffix)
    }
  })

  it('never raises one for a registered-only registration', () => {
    for (const event of drafted) {
      assert.ok(registrationOf(event).accreditation)
    }
  })

  it('walks each note down one lifecycle path in order', () => {
    const paths = new Set([
      'prn.drafted',
      'prn.drafted>prn.discarded',
      'prn.drafted>prn.raised',
      'prn.drafted>prn.raised>prn.deleted',
      'prn.drafted>prn.raised>prn.issued',
      'prn.drafted>prn.raised>prn.issued>prn.accepted',
      'prn.drafted>prn.raised>prn.issued>prn.cancellation-requested',
      'prn.drafted>prn.raised>prn.issued>prn.cancellation-requested>prn.cancelled'
    ])
    for (const [prnId, chain] of byPrn) {
      const path = chain.map((event) => event.type).join('>')
      assert.ok(paths.has(path), `${prnId}: ${path}`)
      for (let index = 1; index < chain.length; index++) {
        assert.ok(chain[index - 1].at < chain[index].at, prnId)
      }
    }
  })

  it('reproduces the calibrated transition rates', () => {
    const raised = ofType(EVENT.PRN_RAISED)
    const issued = ofType(EVENT.PRN_ISSUED)
    near(
      ofType(EVENT.PRN_DISCARDED).length / drafted.length,
      ACTIVITY.prn.discardRate,
      0.005,
      'discard'
    )
    near(
      ofType(EVENT.PRN_DELETED).length / raised.length,
      ACTIVITY.prn.deleteRate,
      0.01,
      'delete'
    )
    near(
      ofType(EVENT.PRN_CANCELLATION_REQUESTED).length / issued.length,
      ACTIVITY.prn.cancelRate,
      0.005,
      'cancel'
    )
    const settled = issued.filter(
      (event) => month(event) <= MEASURED_UNTIL.slice(0, 7)
    )
    near(
      share(settled, (event) =>
        must(byPrn.get(event.prnId)).some(
          (other) => other.type === EVENT.PRN_ACCEPTED
        )
      ),
      ACTIVITY.prn.producerAcceptRate * (1 - ACTIVITY.prn.cancelRate),
      0.02,
      'accept'
    )
  })

  /**
   * Weighted like the fatal share above: a punctual operator has more of its
   * notes accepted and accepted sooner, so the expectation is the mean of the
   * profile rate over the notes that were accepted.
   */
  it('has each note accepted in the month of issue at its operator’s own rate', () => {
    const accepted = ofType(EVENT.PRN_ACCEPTED).filter(
      (event) => month(event) <= MEASURED_UNTIL.slice(0, 7)
    )
    near(
      share(accepted, (event) => {
        const issued = must(
          must(byPrn.get(event.prnId)).find(
            (other) => other.type === EVENT.PRN_ISSUED
          )
        )
        return month(issued) === month(event)
      }),
      mean(
        accepted.map(
          (event) => operatorOf(event).profile.prn.sameMonthAcceptanceShare
        )
      ),
      0.03,
      'same month'
    )
  })
})

describe('weekends', () => {
  const acted = events.filter(
    (event) =>
      event.type !== EVENT.REGISTRATION_APPROVED &&
      !event.type.startsWith('accreditation.')
  )

  it('keeps an operator that takes weekends off out of them', () => {
    const weekdayOnly = acted.filter(
      (event) => !operatorOf(event).profile.worksWeekends
    )
    assert.ok(weekdayOnly.length > 0)
    for (const event of weekdayOnly) assert.ok(!isWeekend(event), event.at)
  })

  it('has weekend workers work weekends', () => {
    const weekendWorkers = acted.filter(
      (event) => operatorOf(event).profile.worksWeekends
    )
    assert.ok(weekendWorkers.length > 0)
    near(share(weekendWorkers, isWeekend), 2 / 7, 0.05, 'weekend share')
  })
})

describe('the period planned', () => {
  it('defaults to the register going live and today', () => {
    const planned = planCalendar({
      population: planPopulation({ seed: 'window', scale: 0.02 }),
      rows
    })
    assert.equal(planned.from, DEFAULT_CALIBRATION.register.activeFrom.goLive)
    assert.equal(planned.to, new Date().toISOString().slice(0, 10))
  })

  it('approves a registration already active on the first day of a later window', () => {
    const from = '2026-05-01'
    const to = '2026-06-30'
    const planned = planCalendar({ population, rows, from, to })
    const later = planned.operators.flatMap((operator) => operator.events)
    const approved = later.filter(
      (event) => event.type === EVENT.REGISTRATION_APPROVED
    )
    assert.equal(
      approved.length,
      registrations.filter((registration) => registration.activeFrom <= to)
        .length
    )
    for (const event of approved) {
      const { activeFrom } = registrationOf(event)
      assert.equal(day(event), activeFrom < from ? from : activeFrom)
    }
    for (const event of later) {
      assert.ok(day(event) >= from && day(event) <= to)
    }
  })

  it('leaves a period still open today unreported', () => {
    const planned = planCalendar({ population, rows, to: '2026-03-15' })
    for (const event of planned.operators.flatMap(
      (operator) => operator.events
    )) {
      if (event.type !== EVENT.REPORT_SUBMITTED) continue
      assert.ok(periodBounds(event).end <= '2026-02-28')
    }
  })

  it('files the last period of an expired accreditation after it expires', () => {
    const planned = planCalendar({ population, rows, to: '2027-02-28' })
    const later = planned.operators.flatMap((operator) => operator.events)
    const expired = registrations.filter(
      (registration) => registration.accreditation?.status === 'approved'
    )
    const december = eventsOfType(later, EVENT.REPORT_SUBMITTED).filter(
      (event) =>
        event.cadence === CADENCE.MONTHLY &&
        event.period === 12 &&
        expired.some((registration) => registration.id === event.registrationId)
    )
    assert.ok(december.length > expired.length * 0.9, `${december.length}`)
    for (const event of later) {
      const { accreditation } = registrationOf(event)
      if (!accreditation || !event.type.startsWith('prn.')) continue
      assert.ok(day(event) <= accreditation.validTo, event.at)
    }
  })

  it('refuses a window that ends before it starts', () => {
    assert.throws(
      () =>
        planCalendar({
          population,
          rows,
          from: '2026-06-01',
          to: '2026-05-31'
        }),
      /before it starts/
    )
  })
})

describe('planning is reproducible', () => {
  const small = planPopulation({ seed: 'replay', scale: 0.05 })
  const smallRows = planSummaryLogRows({ population: small })
  const settings = { population: small, rows: smallRows, to: '2026-09-30' }

  it('gives the same events for the same seed', () => {
    assert.deepEqual(planCalendar(settings), planCalendar(settings))
  })

  it('gives different events for a different seed', () => {
    const other = planPopulation({ seed: 'replay-2', scale: 0.05 })
    assert.notDeepEqual(
      planCalendar(settings).operators[0].events,
      planCalendar({
        population: other,
        rows: planSummaryLogRows({ population: other }),
        to: '2026-09-30'
      }).operators[0].events
    )
  })

  it('renders the same rows for the same upload', () => {
    const planned = planCalendar(settings)
    const registration = smallRows.registrations[0]
    const sequence = eventsOfType(
      planned.operators.flatMap((operator) => operator.events),
      EVENT.SUMMARY_LOG_UPLOADED
    ).filter((event) => event.registrationId === registration.registrationId)
    assert.deepEqual(
      uploadRows({ registration, uploads: sequence }),
      uploadRows({ registration, uploads: sequence })
    )
  })
})

describe('cadenceAt', () => {
  const accredited = must(
    registrations.find((registration) => registration.accreditation)
  )
  const registeredOnly = must(
    registrations.find((registration) => !registration.accreditation)
  )

  it('reads monthly from the day the accreditation starts and quarterly before it', () => {
    assert.equal(
      cadenceAt(accredited, must(accredited.accreditation).validFrom),
      CADENCE.MONTHLY
    )
    assert.equal(cadenceAt(accredited, '2025-12-31'), CADENCE.QUARTERLY)
    assert.equal(cadenceAt(registeredOnly, '2026-12-31'), CADENCE.QUARTERLY)
  })

  /**
   * A period is on the cadence in force when it starts, so a registration
   * accredited part way through a quarter finishes that quarter quarterly and
   * reports monthly from the next.
   */
  it('reports quarterly then monthly for a registration accredited part way through', () => {
    const operator = must(
      population.organisations.find(
        (operator) => operator.id === accredited.organisationId
      )
    )
    /** @type {PlannedRegistration} */
    const later = {
      ...accredited,
      activeFrom: '2026-01-01',
      accreditation: {
        ...must(accredited.accreditation),
        status: 'approved',
        validFrom: '2026-05-01'
      }
    }
    const planned = planCalendar({
      population: {
        ...population,
        organisations: [{ ...operator, registrations: [later] }]
      },
      rows,
      to: TO
    })
    for (const event of planned.operators[0].events.filter(isPrnEvent)) {
      assert.ok(day(event) >= '2026-05-01', event.at)
    }
    const filed = eventsOfType(
      planned.operators[0].events,
      EVENT.REPORT_SUBMITTED
    )
      .filter((event) => event.submissionNumber === 1)
      .map((event) => `${event.cadence}/${event.period}`)
    assert.ok(filed.includes('quarterly/1'), filed.join(' '))
    assert.ok(filed.includes('quarterly/2'), filed.join(' '))
    assert.ok(!filed.includes('quarterly/3'), filed.join(' '))
    assert.ok(filed.includes('monthly/7'), filed.join(' '))
    assert.ok(
      !filed.some(
        (key) => key.startsWith('monthly/') && Number(key.split('/')[1]) < 7
      ),
      filed.join(' ')
    )
  })
})
