import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { DEFAULT_CALIBRATION } from '../population/calibration.js'
import { planPopulation } from '../population/population.js'
import { CONTRIBUTION, heldTonnage, planSummaryLogRows } from '../rows/rows.js'
import { SHEETS } from '../rows/sheets.js'
import {
  addDays,
  cadenceOf,
  lastDayOfMonth,
  monthsOfPeriod,
  planCalendar,
  statusChangeOf,
  uploadRows
} from './calendar.js'
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
 * @param {(member: T) => number} read
 */
const sum = (members, read) =>
  members.reduce((total, member) => total + read(member), 0)

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
/** @param {{at: string}} event */
const monthEndOf = (event) => {
  const [year, monthNumber] = month(event).split('-').map(Number)
  return lastDayOfMonth(year, monthNumber)
}

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
 * The month a registration first submitted a summary log, as `YYYY-MM`, and
 * null where it never did.
 *
 * @param {PlannedRegistration} registration
 */
const firstSubmission = (registration) => {
  const first = landed.find(
    (upload) => upload.registrationId === registration.id
  )
  return first ? month(first) : null
}

/**
 * The last month the note count is measured over. December is left out: what
 * an operator receives in December is kept for a December note, which the
 * calendar does not plan, so it drafts fewer general notes that month.
 */
const LAST_COUNTED_MONTH = '2026-11'

/**
 * Whole months a registration could issue notes in, up to the last counted
 * month: those after the month of its first submitted summary log.
 *
 * @param {PlannedRegistration} registration
 */
const issuingMonths = (registration) => {
  const first = firstSubmission(registration)
  return first
    ? Number(LAST_COUNTED_MONTH.slice(5, 7)) - Number(first.slice(5, 7))
    : 0
}

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

  it('stops a registration doing anything once its accreditation is cancelled', () => {
    for (const change of ofType(EVENT.ACCREDITATION_CANCELLED)) {
      const after = events.filter(
        (event) =>
          event.registrationId === change.registrationId && event.at > change.at
      )
      assert.deepEqual(after, [])
    }
  })

  it('changes an accreditation on the day the row planner stops its rows', () => {
    for (const event of changed) {
      assert.equal(
        day(event),
        must(statusChangeOf(registrationOf(event), population.seed)).day
      )
    }
  })

  it('uploads no load dated after the accreditation changed', () => {
    for (const change of changed) {
      const planned = rowsOf(must(change.registrationId))
      for (const upload of uploadsOf(planned.registrationId)) {
        for (const row of viewOf(planned, upload)) {
          assert.ok(
            row.date <= day(change),
            `${planned.registrationId} uploads a load of ${row.date} after its ${change.type} on ${day(change)}`
          )
        }
      }
    }
  })

  /**
   * A suspended accreditation owes its monthly reports and keeps uploading
   * what it recorded before, though the service excludes any load dated after
   * the suspension; its notes stop.
   */
  it('keeps a suspended registration uploading and reporting, but issuing nothing', () => {
    for (const change of ofType(EVENT.ACCREDITATION_SUSPENDED)) {
      const after = events.filter(
        (event) =>
          event.registrationId === change.registrationId && event.at > change.at
      )
      assert.ok(after.some((event) => event.type === EVENT.REPORT_SUBMITTED))
      assert.ok(
        after.some((event) => event.type === EVENT.SUMMARY_LOG_UPLOADED)
      )
      assert.deepEqual(after.filter(isPrnEvent), [])
    }
  })

  it('has every registration do something before its accreditation changes', () => {
    for (const change of changed) {
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

  it('plans no status change that falls after the run ends', () => {
    const planned = planCalendar({ population, rows, to: '2026-01-30' })
    const changes = planned.operators
      .flatMap((operator) => operator.events)
      .filter((event) => event.type.startsWith('accreditation.'))
    assert.deepEqual(changes, [])
  })

  it('changes an accreditation on the first day of a run that starts after the change', () => {
    const from = addDays(changed.map(day).sort().at(-1) ?? '', 1)
    const planned = planCalendar({ population, rows, from, to: TO })
    const changes = planned.operators
      .flatMap((operator) => operator.events)
      .filter((event) => event.type.startsWith('accreditation.'))
    assert.equal(changes.length, changed.length)
    for (const event of changes) assert.equal(day(event), from)
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

  /**
   * Over the year from April. What an upload cannot amend is owed to the next
   * one, so a registration runs short in the months after its first upload,
   * with nothing yet owed to make up, and catches up later; a quarter's
   * window would judge the catching up rather than the volume. The
   * registered-only streams are left out: they hold a handful of
   * registrations, too few to measure a rate on.
   */
  describe('amends the calibrated rows over the year', () => {
    const settledFrom = '2026-04'
    const reporting = rows.registrations.filter((planned) => {
      const registration = registrationOf(planned)
      return (
        registration.status === 'approved' &&
        registration.accreditation?.status === 'approved'
      )
    })

    for (const stream of [
      'exporter',
      'reprocessorInput',
      'reprocessorOutput'
    ]) {
      it(`on the ${stream} stream`, () => {
        const members = reporting.filter((planned) => planned.stream === stream)
        const amended = sum(members, (planned) =>
          sum(
            uploadsOf(planned.registrationId).filter(
              (upload) =>
                upload.outcome === UPLOAD_OUTCOME.SUBMITTED &&
                month(upload) >= settledFrom
            ),
            (upload) => upload.amendments?.count ?? 0
          )
        )
        const calibrated = sum(
          members,
          (planned) =>
            ACTIVITY.rowsPerSubmission[stream].updated *
            operatorOf(planned).profile.volumeFactor *
            new Set(
              planned.rows
                .map((row) => row.period)
                .filter((period) => period >= settledFrom)
            ).size
        )
        near(amended / calibrated, 1, 0.05, `${stream} amended rows`)
      })
    }
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
  const rejected = uploads.filter(
    (upload) => upload.outcome === UPLOAD_OUTCOME.REJECTED
  )

  it('makes each rejection fatal at its operator’s own rate, of the kinds the calibration names', () => {
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
    assert.ok(kinds.removedRow > kinds.badDate)
    assert.ok(kinds.removedRow > kinds.unreadable)
  })

  /**
   * The required-field check an error spoils is gated by the same balance
   * contribution that decides severity, so an error never sits on a
   * non-crediting worksheet even though a bad date can.
   */
  it('plants an error only on a worksheet the service reads into the waste balance', () => {
    const errors = rejected.filter(
      (upload) => must(upload.issues).severity === ISSUE_SEVERITY.ERROR
    )
    assert.ok(errors.length > 0)
    for (const upload of errors) {
      const { stream } = rowsOf(upload.registrationId)
      for (const ref of must(upload.issues).rows) {
        assert.notEqual(
          SHEETS[stream][ref.worksheet].contribution,
          CONTRIBUTION.NONE,
          `${upload.registrationId} ${upload.at} plants an error on ${ref.worksheet}`
        )
      }
    }
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

  /**
   * A registration's first rejected upload, and its stream.
   */
  const firstRejections = registrations.flatMap((registration) => {
    const own = uploadsOf(registration.id)
    const first = own.filter((upload) => upload.cutoff === own[0].cutoff)
    const { stream } = rowsOf(registration.id)
    return first
      .filter((upload) => upload.outcome === UPLOAD_OUTCOME.REJECTED)
      .map((upload) => ({ upload, stream }))
  })

  it('spoils a date on a first upload that draws a fatal issue, having nothing yet to remove', () => {
    const fatal = firstRejections.filter(
      ({ upload }) => must(upload.issues).severity === ISSUE_SEVERITY.FATAL
    )
    assert.ok(fatal.length > 0)
    const kinds = tally(fatal, ({ upload }) => must(upload.issues).kind)
    assert.equal(kinds.removedRow, undefined)
    assert.ok(kinds.badDate > 0)
  })

  it('spoils a date on a registered-only stream’s first rejection too, unless it carries no row to spoil', () => {
    const onRegisteredOnly = firstRejections.filter(({ stream }) =>
      stream.startsWith('regOnly')
    )
    assert.ok(onRegisteredOnly.length > 0)
    const kinds = tally(
      onRegisteredOnly,
      ({ upload }) => must(upload.issues).kind
    )
    assert.ok(kinds.badDate > 0)
    for (const { upload } of onRegisteredOnly) {
      const { severity, kind } = must(upload.issues)
      assert.equal(severity, ISSUE_SEVERITY.FATAL)
      assert.ok(kind === ISSUE_KIND.BAD_DATE || kind === ISSUE_KIND.UNREADABLE)
    }
  })

  it('leaves no rejection but an unreadable one without a row to sit on', () => {
    for (const upload of rejected.filter(
      (upload) => must(upload.issues).kind !== ISSUE_KIND.UNREADABLE
    )) {
      assert.ok(
        must(upload.issues).rows.length > 0,
        `${upload.registrationId} ${upload.at} plants ${must(upload.issues).kind} on no row`
      )
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

  it('changes a restated row whether or not the upload amends anything', () => {
    const restating = must(landed.find((upload) => upload.restated.length > 0))
    const planned = rowsOf(restating.registrationId)
    const sequence = uploadsOf(restating.registrationId)
    const before = sequence.slice(0, sequence.indexOf(restating))
    const unamended = { ...restating, amendments: null }
    const view = byKey(
      uploadRows({ registration: planned, uploads: [...before, unamended] })
    )
    const original = byKey(planned.rows)
    for (const ref of restating.restated) {
      const key = rowKey(ref)
      assert.notEqual(must(view.get(key)).seed, must(original.get(key)).seed)
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

  describe('tonnage recycled', () => {
    /** Far enough past the year for every late return of December to be filed. */
    const filed = planCalendar({ population, rows, to: '2027-04-30' })
    const filedReports = eventsOfType(
      filed.operators.flatMap((operator) => operator.events),
      EVENT.REPORT_SUBMITTED
    )
    const national =
      must(
        ACTIVITY.summaryLogSheets.reprocessorOutput[
          'Reprocessed (sections 3 and 4)'
        ].monthlyTonnage
      ) * 12

    it('lands the estate’s reports on the national figure once over the year', () => {
      const reported = filedReports
        .filter((report) => report.submissionNumber === 1)
        .reduce((sum, report) => sum + (report.tonnageRecycled ?? 0), 0)
      // Below it by the returns missed and the registrations cancelled, and no more.
      assert.ok(reported <= national, `${reported} over ${national}`)
      near(reported / national, 1, 0.03, 'reported over national')
    })

    describe('on a calibration whose received figure is thrice its recycled figure', () => {
      const calibration = structuredClone(DEFAULT_CALIBRATION)
      const recycled = must(
        calibration.activity.summaryLogSheets.reprocessorOutput[
          'Reprocessed (sections 3 and 4)'
        ].monthlyTonnage
      )
      calibration.activity.summaryLogSheets.reprocessorInput[
        'Received (sections 1, 2 and 3)'
      ].monthlyTonnage = recycled * 3
      const scale = 0.2
      const skewedPopulation = planPopulation({ seed: 'calendar', scale })
      const skewedRows = planSummaryLogRows({
        population: skewedPopulation,
        calibration
      })
      const skewed = planCalendar({
        population: skewedPopulation,
        rows: skewedRows,
        to: '2027-04-30',
        calibration
      })
      const skewedReports = eventsOfType(
        skewed.operators.flatMap((operator) => operator.events),
        EVENT.REPORT_SUBMITTED
      )
      /** @param {ReportEvent} report */
      const creditedIn = (report) =>
        must(
          skewedRows.registrations.find(
            (planned) => planned.registrationId === report.registrationId
          )
        )
          .rows.filter(
            (row) =>
              row.contribution === CONTRIBUTION.CREDIT &&
              monthsOfPeriod(report).includes(row.period)
          )
          .reduce((sum, row) => sum + row.tonnage, 0)

      /**
       * A fifth of the estate misses and cancels a lumpier share of the figure
       * than the whole does, so the skewed run is held to what the same estate
       * reports unskewed rather than to the figure itself.
       */
      it('still lands the estate’s reports on the recycled figure, not on what the rows credit', () => {
        /** @param {ReportEvent[]} reports */
        const reportedIn = (reports) =>
          reports
            .filter((report) => report.submissionNumber === 1)
            .reduce((sum, report) => sum + (report.tonnageRecycled ?? 0), 0)
        const unskewed = planCalendar({
          population: skewedPopulation,
          rows: planSummaryLogRows({ population: skewedPopulation }),
          to: '2027-04-30'
        })
        const unskewedReports = eventsOfType(
          unskewed.operators.flatMap((operator) => operator.events),
          EVENT.REPORT_SUBMITTED
        )
        const reported = reportedIn(skewedReports)
        assert.ok(
          reported <= recycled * 12 * scale,
          `${reported} over the figure`
        )
        near(
          reported / reportedIn(unskewedReports),
          1,
          0.001,
          'skewed over unskewed'
        )
      })

      it('carries what the output template’s reprocessed rows credit in the period', () => {
        const reports = skewedReports.filter(
          (report) =>
            must(
              skewedRows.registrations.find(
                (planned) => planned.registrationId === report.registrationId
              )
            ).stream === 'reprocessorOutput'
        )
        assert.ok(reports.length > 0)
        for (const report of reports) {
          assert.equal(
            report.tonnageRecycled,
            heldTonnage(creditedIn(report)),
            report.registrationId
          )
        }
      })

      it('carries a third of what the input template’s received rows credit in the period', () => {
        const reports = skewedReports.filter(
          (report) =>
            must(
              skewedRows.registrations.find(
                (planned) => planned.registrationId === report.registrationId
              )
            ).stream === 'reprocessorInput'
        )
        assert.ok(reports.length > 0)
        for (const report of reports) {
          assert.equal(
            report.tonnageRecycled,
            heldTonnage(creditedIn(report) / 3),
            report.registrationId
          )
        }
      })
    })

    it('refuses an accredited reprocessor whose rows give it no stream to draw the figure from', () => {
      const accredited = must(
        registrations.find(
          (registration) =>
            registration.processingType === 'reprocessor' &&
            registration.accreditation
        )
      )
      const without = {
        ...rows,
        registrations: rows.registrations.filter(
          (planned) => planned.registrationId !== accredited.id
        )
      }
      assert.throws(
        () => planCalendar({ population, rows: without, to: TO }),
        new RegExp(
          `${accredited.id} is an accredited reprocessor with no stream`
        )
      )
    })

    it('refuses a calibration that gives the recycled worksheet no figure', () => {
      const calibration = structuredClone(DEFAULT_CALIBRATION)
      delete calibration.activity.summaryLogSheets.reprocessorOutput[
        'Reprocessed (sections 3 and 4)'
      ].monthlyTonnage
      assert.throws(
        () => planCalendar({ population, rows, to: TO, calibration }),
        /gives reprocessorOutput worksheet "Reprocessed \(sections 3 and 4\)" no monthlyTonnage/
      )
    })

    it('carries the same figure on a resubmission as on the first submission', () => {
      const resubmitted = filedReports.filter(
        (report) => report.submissionNumber > 1
      )
      assert.ok(resubmitted.length > 0)
      for (const report of resubmitted) {
        const first = must(
          filedReports.find(
            (other) =>
              other.registrationId === report.registrationId &&
              other.year === report.year &&
              other.period === report.period &&
              other.submissionNumber === 1
          )
        )
        assert.notEqual(first.tonnageRecycled, undefined)
        assert.equal(report.tonnageRecycled, first.tonnageRecycled)
      }
    })

    it('carries nothing on an exporter’s report and nought on a registered-only reprocessor’s', () => {
      for (const report of filedReports) {
        const registration = registrationOf(report)
        if (registration.processingType === 'exporter') {
          assert.equal(report.tonnageRecycled, null)
        } else if (!registration.accreditation) {
          assert.equal(report.tonnageRecycled, 0)
        }
      }
    })
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
   * registration's own factor over the months it could issue in. Those are
   * the whole months after its first submission, so the notes counted are
   * the ones drafted in them.
   *
   * The count is drawn evenly either side of the rate, so at full scale the
   * estate mean sits a few per cent from it by the seed, and a note the
   * balance cannot give a whole tonne is not drafted. The tolerance covers
   * both.
   */
  /** @param {PlannedRegistration[]} members */
  const expectedPerMonth = (members) =>
    (ACTIVITY.prnsPerAccreditationPerMonth *
      members.reduce(
        (sum, registration) =>
          sum + volumeOf(registration) * issuingMonths(registration),
        0
      )) /
    members.reduce((sum, registration) => sum + issuingMonths(registration), 0)
  /** @param {PlannedRegistration[]} members */
  const draftedPerMonth = (members) =>
    drafted.filter((event) =>
      members.some(
        (registration) =>
          registration.id === event.registrationId &&
          month(event) > must(firstSubmission(registration)) &&
          month(event) <= LAST_COUNTED_MONTH
      )
    ).length /
    members.reduce((sum, registration) => sum + issuingMonths(registration), 0)

  it('drafts no note before the registration has submitted a summary log', () => {
    for (const event of drafted) {
      const first = must(
        landed.find((upload) => upload.registrationId === event.registrationId)
      )
      assert.ok(event.at > first.at, `${event.registrationId} ${event.at}`)
    }
  })

  it('raises the calibrated number a month per accreditation', () => {
    near(
      draftedPerMonth(accredited),
      expectedPerMonth(accredited),
      0.1,
      'PRNs per accreditation month'
    )
  })

  /**
   * A material with twenty-odd accreditations swings a sixth either side of
   * the rate by the seed, and a third on a bad one. So a material below forty
   * accreditations is held to a third on its own, which still catches one
   * starved or over-issued, and the tenth is asked of them together. One with
   * a handful is held only in that total, since its own rate is a coin toss.
   */
  it('raises them for every accredited material at that material’s rate', () => {
    const suffixes = [
      ...new Set(accredited.map((registration) => registration.material.suffix))
    ]
    const everAccredited = new Set(
      registrations
        .filter((registration) => registration.accreditation)
        .map((registration) => registration.material.suffix)
    )
    for (const suffix of Object.keys(
      tally(drafted, (event) => registrationOf(event).material.suffix)
    )) {
      assert.ok(everAccredited.has(suffix), `${suffix} drafted unaccredited`)
    }
    /** @type {PlannedRegistration[]} */
    const rare = []
    for (const suffix of suffixes) {
      const members = accredited.filter(
        (registration) => registration.material.suffix === suffix
      )
      const expected = expectedPerMonth(members)
      if (members.length < 40) {
        rare.push(...members)
        if (members.length >= 10) {
          near(draftedPerMonth(members), expected, expected / 3, suffix)
        }
        continue
      }
      near(draftedPerMonth(members), expected, 0.25, suffix)
    }
    near(
      draftedPerMonth(rare),
      expectedPerMonth(rare),
      expectedPerMonth(rare) / 10,
      'the rarer materials together'
    )
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
   * profile rate over the notes that were accepted. The notes are the ones
   * issued before the last measured month, so both months either could be
   * accepted in are measured.
   */
  it('has each note accepted in the month of issue at its operator’s own rate', () => {
    /** @param {PrnEvent} event */
    const issueOf = (event) =>
      must(
        must(byPrn.get(event.prnId)).find(
          (other) => other.type === EVENT.PRN_ISSUED
        )
      )
    const accepted = ofType(EVENT.PRN_ACCEPTED).filter(
      (event) => month(issueOf(event)) < MEASURED_UNTIL.slice(0, 7)
    )
    near(
      share(accepted, (event) => month(issueOf(event)) === month(event)),
      mean(
        accepted.map(
          (event) => operatorOf(event).profile.prn.sameMonthAcceptanceShare
        )
      ),
      0.03,
      'same month'
    )
  })

  /**
   * What the calibration expects accepted in a month, from the notes the plan
   * issued: each operator's accepted share of a month's issues lands that
   * month at its same-month share, and the rest the month after.
   *
   * @param {string} of - `YYYY-MM`
   */
  const expectedAcceptedIn = (of) =>
    ofType(EVENT.PRN_ISSUED).reduce((sum, issued) => {
      const { prn } = operatorOf(issued).profile
      const accepted = (1 - prn.cancelRate) * prn.producerAcceptRate
      if (month(issued) === of) {
        return sum + accepted * prn.sameMonthAcceptanceShare
      }
      if (addDays(monthEndOf(issued), 1).slice(0, 7) === of) {
        return sum + accepted * (1 - prn.sameMonthAcceptanceShare)
      }
      return sum
    }, 0)

  /**
   * The count a month is drawn to varies with a few large operators, so a
   * month is held to a tenth and the year, where that evens out, to a fiftieth.
   */
  it('lands each month’s acceptances in the month the calibration puts them', () => {
    const accepted = ofType(EVENT.PRN_ACCEPTED)
    const months = [...new Set(ofType(EVENT.PRN_ISSUED).map(month))].sort()
    for (const of of months) {
      const expected = expectedAcceptedIn(of)
      near(
        accepted.filter((event) => month(event) === of).length,
        expected,
        expected / 10,
        `accepted in ${of}`
      )
    }
    const overYear = months.reduce((sum, of) => sum + expectedAcceptedIn(of), 0)
    near(accepted.length, overYear, overYear / 50, 'accepted over the year')
  })

  /**
   * A note issued on the last day its operator works in the month is accepted
   * at the same rates as any other, which in that month means on the day of
   * issue. December's are left out: the month after is past the end of the
   * calendar.
   */
  it('accepts a note issued on its operator’s last working day of the month at its operator’s rates', () => {
    const lastWorkingDay = ofType(EVENT.PRN_ISSUED).filter((issued) => {
      if (month(issued).endsWith('-12')) return false
      const daysLeft = daysBetween(day(issued), monthEndOf(issued))
      for (let ahead = 1; ahead <= daysLeft; ahead++) {
        if (
          operatorOf(issued).profile.worksWeekends ||
          !isWeekend({ at: addDays(day(issued), ahead) })
        ) {
          return false
        }
      }
      return must(byPrn.get(issued.prnId)).every(
        (other) => other.type !== EVENT.PRN_CANCELLATION_REQUESTED
      )
    })
    assert.ok(lastWorkingDay.length >= 100, `${lastWorkingDay.length}`)
    /** @param {PrnEvent} issued */
    const acceptanceOf = (issued) =>
      must(byPrn.get(issued.prnId)).find(
        (other) => other.type === EVENT.PRN_ACCEPTED
      )
    const accepted = lastWorkingDay.filter(acceptanceOf)
    near(
      accepted.length / lastWorkingDay.length,
      mean(
        lastWorkingDay.map(
          (issued) => operatorOf(issued).profile.prn.producerAcceptRate
        )
      ),
      0.1,
      'accepted'
    )
    near(
      share(
        accepted,
        (issued) => month(must(acceptanceOf(issued))) === month(issued)
      ),
      mean(
        accepted.map(
          (issued) => operatorOf(issued).profile.prn.sameMonthAcceptanceShare
        )
      ),
      0.1,
      'accepted in the month of issue'
    )
  })

  it('carries a whole tonnage of at least a tonne and the material’s price on every event of a note', () => {
    for (const event of prnEvents) {
      assert.ok(
        Number.isInteger(event.tonnage) && event.tonnage >= 1,
        `${event.prnId} ${event.type} carries ${event.tonnage} t`
      )
      assert.equal(
        event.pricePerTonne,
        ACTIVITY.prnPricePerTonne[registrationOf(event).material.suffix],
        `${event.prnId} ${event.type}`
      )
    }
    for (const chain of byPrn.values()) {
      assert.equal(
        new Set(chain.map((event) => event.tonnage)).size,
        1,
        chain[0].prnId
      )
    }
  })

  /**
   * Whether the service keeps a credit for a December note: the overseas
   * reprocessor received an exported load in December, or a reprocessor
   * received or reprocessed one then. Spelt out here, apart from what the
   * sheets declare, so the plan is checked against the service's rule rather
   * than its own.
   *
   * @param {PlannedRegistration} registration
   * @param {PlannedLogRow} row
   */
  const isDecemberCredit = (registration, row) =>
    row.contribution === CONTRIBUTION.CREDIT &&
    (registration.processingType === 'exporter'
      ? String(row.fields.DATE_RECEIVED_BY_OSR).slice(3, 5)
      : row.date.slice(5, 7)) === '12'

  /**
   * The balance the service holds for an accreditation, replayed from its
   * events: what its submitted uploads credited outside December, less what
   * they debited, less every note holding tonnage. A note draws it when
   * raised and gives it back when deleted or cancelled.
   *
   * @param {PlannedRegistration} registration
   * @returns {number} the lowest the balance went at a raise
   */
  const lowestBalanceAtRaise = (registration) => {
    const planned = rowsOf(registration.id)
    const own = events.filter(
      (event) =>
        'registrationId' in event && event.registrationId === registration.id
    )
    /** @type {Map<string, number>} */
    const holding = new Map()
    let credited = 0
    let lowest = Infinity
    for (const event of own) {
      if (
        event.type === EVENT.SUMMARY_LOG_UPLOADED &&
        event.outcome === UPLOAD_OUTCOME.SUBMITTED
      ) {
        credited = planned.rows
          .filter(
            (row) =>
              row.date <= event.cutoff && !isDecemberCredit(registration, row)
          )
          .reduce(
            (sum, row) =>
              sum +
              (row.contribution === CONTRIBUTION.CREDIT
                ? row.tonnage
                : -row.tonnage),
            0
          )
      }
      if (!isPrnEvent(event)) continue
      if (event.type === EVENT.PRN_RAISED) {
        holding.set(event.prnId, event.tonnage)
        const held = [...holding.values()].reduce((sum, t) => sum + t, 0)
        lowest = Math.min(lowest, credited - held)
      }
      if (
        event.type === EVENT.PRN_DELETED ||
        event.type === EVENT.PRN_CANCELLED
      ) {
        holding.delete(event.prnId)
      }
    }
    return lowest
  }

  it('never raises a note the balance its uploads have built cannot fund', () => {
    for (const registration of accredited) {
      const lowest = lowestBalanceAtRaise(registration)
      assert.ok(lowest >= 0, `${registration.id} went to ${lowest} t`)
    }
  })

  it('issues the calibrated share of what each processing type credits outside December', () => {
    const issued = ofType(EVENT.PRN_ISSUED)
    for (const processingType of ['reprocessor', 'exporter']) {
      const members = accredited.filter(
        (registration) => registration.processingType === processingType
      )
      let planned = 0
      let creditedByLastDraw = 0
      for (const registration of members) {
        const own = drafted.filter(
          (event) => event.registrationId === registration.id
        )
        if (own.length === 0) continue
        planned += issued
          .filter((event) => event.registrationId === registration.id)
          .reduce((sum, event) => sum + event.tonnage, 0)
        const lastDraft = must(own.at(-1))
        const cutoff = landed
          .filter(
            (upload) =>
              upload.registrationId === registration.id &&
              day(upload) < day(lastDraft)
          )
          .at(-1)?.cutoff
        creditedByLastDraw += rowsOf(registration.id)
          .rows.filter(
            (row) =>
              row.contribution === CONTRIBUTION.CREDIT &&
              row.date <= must(cutoff) &&
              !isDecemberCredit(registration, row)
          )
          .reduce((sum, row) => sum + row.tonnage, 0)
      }
      near(
        planned / creditedByLastDraw,
        ACTIVITY.prnIssuedShare[processingType],
        0.02,
        processingType
      )
    }
  })

  it('does not make a month’s first note its largest', () => {
    /** @type {boolean[]} */
    const firstIsLargest = []
    for (const registration of accredited) {
      const own = drafted.filter(
        (event) => event.registrationId === registration.id
      )
      for (const key of new Set(own.map(month))) {
        const inMonth = own.filter((event) => month(event) === key)
        if (inMonth.length < 3) continue
        firstIsLargest.push(
          inMonth.every((event) => event.tonnage <= inMonth[0].tonnage)
        )
      }
    }
    assert.ok(firstIsLargest.length > 100, `${firstIsLargest.length}`)
    assert.ok(
      share(firstIsLargest, (largest) => largest) < 0.5,
      `${share(firstIsLargest, (largest) => largest)}`
    )
  })

  it('refuses a material the calibration prices nothing for', () => {
    const { PL, ...rest } = ACTIVITY.prnPricePerTonne
    assert.ok(PL > 0)
    assert.throws(
      () =>
        planCalendar({
          population,
          rows,
          to: TO,
          calibration: {
            ...DEFAULT_CALIBRATION,
            activity: { ...ACTIVITY, prnPricePerTonne: rest }
          }
        }),
      /no price for PL/
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

describe('cadenceOf', () => {
  it('is monthly for an accredited registration and quarterly otherwise', () => {
    const accredited = must(
      registrations.find((registration) => registration.accreditation)
    )
    const registeredOnly = must(
      registrations.find((registration) => !registration.accreditation)
    )
    assert.equal(cadenceOf(accredited), CADENCE.MONTHLY)
    assert.equal(cadenceOf(registeredOnly), CADENCE.QUARTERLY)
  })
})
