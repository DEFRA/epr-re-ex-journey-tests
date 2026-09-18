/**
 * Plans when everything happens: a timestamped event list per operator across
 * the period, on the population and the planned rows.
 *
 * Pure and seeded, like the planners it reads: nothing here calls an API, reads
 * a clock or touches the filesystem, and the same seed and period always give
 * the same events. The event types are enumerated in `events.js`; README.md
 * says what each carries and how the dates are drawn.
 */

import { DEFAULT_CALIBRATION } from '../population/calibration.js'
import { createRandom } from '../population/random.js'
import { CONTRIBUTION, SHEETS } from '../rows/sheets.js'
import {
  CADENCE,
  EVENT,
  ISSUE_KIND,
  ISSUE_KINDS_BY_SEVERITY,
  ISSUE_SEVERITY,
  UPLOAD_OUTCOME
} from './events.js'

/** @import {PlannedPopulation, PlannedOperator, PlannedRegistration} from '../population/population.js' */
/** @import {PlannedRows, PlannedRegistrationRows, PlannedLogRow} from '../rows/rows.js' */
/** @import {Calibration} from '../population/calibration.js' */
/** @import {Random} from '../population/random.js' */
/** @import {CalendarEvent, UploadEvent, PrnEvent, RowRef, UploadIssues, Drafted} from './events.js' */

/**
 * @typedef {Object} PlannedCalendar
 * @property {string} seed
 * @property {string} from - ISO date
 * @property {string} to - ISO date
 * @property {{organisationId: string, events: CalendarEvent[]}[]} operators
 */

/**
 * @typedef {Object} Period - one reporting period of a registration, cut to the days it was active
 * @property {number} year
 * @property {'monthly' | 'quarterly'} cadence
 * @property {number} period
 * @property {string} first - first active day in it
 * @property {string} last - last active day in it
 * @property {string} end - the period's own last day
 * @property {string} due
 * @property {string[]} months - `YYYY-MM` keys of the months it spans
 */

/**
 * @typedef {Object} Draft - an event before it is timestamped
 * @property {string} day - ISO date
 * @property {number} sequence - order among events of the same day
 * @property {Drafted<CalendarEvent>} event
 */

/** A suspension or cancellation lands no sooner than this into a registration's year. */
const EARLIEST_STATUS_CHANGE_DAYS = 30

/** How long after the deadline the latest of the late returns arrive. */
const LATEST_RETURN_DAYS_AFTER_DUE = 90

/** On-time returns are early when filed at least this long before the deadline. */
const EARLY_DAYS_BEFORE_DUE = 10

/** A resubmission follows the upload that restated the period within this many days. */
const RESUBMISSION_DAYS_AFTER_UPLOAD = 14

/** A PRN moves from one state to the next within this many days. */
const PRN_STEP_DAYS = 3

/** The producer asks for a cancellation within this many days of issue. */
const PRN_CANCELLATION_REQUEST_DAYS = 10

/** Rows an upload plants an error on. */
const MAX_ROWS_WITH_ISSUES = 3

/**
 * The hours a time of day is drawn from. Events drawn on one day keep their
 * order by moving later, so the last hour of the working day is left as room
 * for that rather than drawn into.
 */
const WORKING_HOURS = { first: 8, last: 16 }

const MONTHS_PER_PERIOD = { [CADENCE.MONTHLY]: 1, [CADENCE.QUARTERLY]: 3 }

const DAY_MS = 24 * 60 * 60 * 1000
const MINUTE_MS = 60 * 1000
const SECOND_MS = 1000

/** @param {string} day - ISO date */
const parse = (day) => new Date(`${day}T00:00:00Z`)
/** @param {Date} date */
const iso = (date) => date.toISOString().slice(0, 10)
/** @param {string} day @param {number} days */
const addDays = (day, days) =>
  iso(new Date(parse(day).getTime() + days * DAY_MS))
/** @param {string} from @param {string} to */
const daysBetween = (from, to) =>
  Math.round((parse(to).getTime() - parse(from).getTime()) / DAY_MS)
/** @param {string} a @param {string} b */
const later = (a, b) => (a > b ? a : b)
/** @param {string} a @param {string} b */
const earlier = (a, b) => (a < b ? a : b)
/** @param {string} day */
const isWeekend = (day) => [0, 6].includes(parse(day).getUTCDay())
/** @param {string} day @returns {string} `YYYY-MM` */
const monthKey = (day) => day.slice(0, 7)
/** @param {number} year @param {number} month - 1 to 12 */
const monthOf = (year, month) => `${year}-${String(month).padStart(2, '0')}`
/** @param {number} year @param {number} month - 1 to 12 */
const lastDayOfMonth = (year, month) => iso(new Date(Date.UTC(year, month, 0)))
const today = () => iso(new Date())

/** @param {RowRef} row */
const rowKey = (row) => `${row.worksheet}/${row.rowId}`

/**
 * The seed an amended row draws its unpinned cells from, so that the same row
 * amended by the same upload always lands the same way.
 *
 * @param {PlannedLogRow} row
 * @param {string} by - what amends it: the upload's amendment seed, or its cutoff for a restatement
 */
const reseed = (row, by) =>
  createRandom(`${row.seed}/${by}`).int(1, 2 ** 31 - 1)

/** @param {PlannedLogRow} row @returns {RowRef} */
const refOf = ({ worksheet, rowId }) => ({ worksheet, rowId })

/**
 * The day, or the nearest working day to it that stays inside the bounds it was
 * drawn in. A Saturday steps back to the Friday and a Sunday on to the Monday,
 * unless that leaves the range, so a return drawn on time stays on time and
 * one drawn a week late stays a week late.
 *
 * @param {string} day
 * @param {string} notBefore
 * @param {string} notAfter
 * @returns {string}
 */
function onWorkingDay(day, notBefore, notAfter) {
  if (!isWeekend(day)) return day
  const preferred = addDays(day, parse(day).getUTCDay() === 6 ? -1 : 1)
  const other = addDays(day, parse(day).getUTCDay() === 6 ? 2 : -2)
  /** @param {string} candidate */
  const within = (candidate) => candidate >= notBefore && candidate <= notAfter
  if (within(preferred)) return preferred
  if (within(other)) return other
  return day
}

/**
 * A day drawn between two dates, moved onto a working day for an operator that
 * takes weekends off. Null where there is no such day to move to, which is a
 * range of a weekend or less: nothing is planned there rather than something
 * on a day the operator does not work.
 *
 * @param {string} notBefore
 * @param {string} notAfter
 * @param {Random} random
 * @param {boolean} worksWeekends
 * @returns {string | null}
 */
function dayBetween(notBefore, notAfter, random, worksWeekends) {
  const drawn = addDays(
    notBefore,
    random.int(0, daysBetween(notBefore, notAfter))
  )
  if (worksWeekends) return drawn
  const working = onWorkingDay(drawn, notBefore, notAfter)
  return isWeekend(working) ? null : working
}

/**
 * The reporting cadence a registration is on: monthly if accredited, quarterly
 * if registered only.
 *
 * @param {PlannedRegistration} registration
 * @returns {'monthly' | 'quarterly'}
 */
export function cadenceOf(registration) {
  return registration.accreditation ? CADENCE.MONTHLY : CADENCE.QUARTERLY
}

/**
 * The reporting period a day falls in, on a cadence.
 *
 * @param {string} day
 * @param {'monthly' | 'quarterly'} cadence
 * @param {number} dueDay
 * @returns {Omit<Period, 'first' | 'last'>}
 */
function periodContaining(day, cadence, dueDay) {
  const year = Number(day.slice(0, 4))
  const month = Number(day.slice(5, 7))
  const months = MONTHS_PER_PERIOD[cadence]
  const period = Math.ceil(month / months)
  const endMonth = period * months
  const dueYear = endMonth === 12 ? year + 1 : year
  const dueMonth = endMonth === 12 ? 1 : endMonth + 1
  return {
    year,
    cadence,
    period,
    end: lastDayOfMonth(year, endMonth),
    due: `${monthOf(dueYear, dueMonth)}-${String(dueDay).padStart(2, '0')}`,
    months: Array.from({ length: months }, (_, index) =>
      monthOf(year, endMonth - months + index + 1)
    )
  }
}

/**
 * The reporting periods a registration is active for between two days, each
 * on the cadence in force when it starts.
 *
 * @param {PlannedRegistration} registration
 * @param {string} first
 * @param {string} last
 * @param {number} dueDay
 * @returns {Period[]}
 */
function reportingPeriods(registration, first, last, dueDay) {
  const periods = []
  let day = first
  while (day <= last) {
    const period = periodContaining(day, cadenceOf(registration), dueDay)
    periods.push({ ...period, first: day, last: earlier(period.end, last) })
    day = addDays(period.end, 1)
  }
  return periods
}

/**
 * Where a registration ends up, and when. The population states the end state
 * of each accreditation and nothing about the day it got there, so the day is
 * drawn here: somewhere after the registration has had a month to report.
 *
 * @param {PlannedRegistration} registration
 * @param {string} first
 * @param {string} last
 * @param {Random} random
 * @returns {{type: 'accreditation.suspended' | 'accreditation.cancelled', day: string} | null}
 */
function statusChange(registration, first, last, random) {
  const status = registration.accreditation?.status
  const type =
    status === 'suspended'
      ? EVENT.ACCREDITATION_SUSPENDED
      : status === 'cancelled'
        ? EVENT.ACCREDITATION_CANCELLED
        : null
  if (!type) return null

  const earliest = earlier(addDays(first, EARLIEST_STATUS_CHANGE_DAYS), last)
  const day = dayBetween(earliest, last, random, false)
  return day ? { type, day } : null
}

/**
 * The day a report is filed, drawn from the operator's punctuality: on time,
 * or one of three degrees of late. Null where the return is missed
 * altogether.
 *
 * @param {Period} period
 * @param {import('../population/profiles.js').BehaviourProfile} profile
 * @param {Random} random
 * @returns {string | null}
 */
function reportDay(period, profile, random) {
  const { reporting } = profile
  if (random.float() < reporting.missedReturnRate) return null

  const { onTime, lateWithin7, lateWithin30, lateBeyond30 } = reporting
  const bucket = random.weighted({
    onTime,
    lateWithin7,
    lateWithin30,
    lateBeyond30
  })
  const { due } = period
  const [notBefore, notAfter] = {
    onTime:
      random.float() < reporting.earlyShare
        ? [addDays(period.end, 1), addDays(due, -EARLY_DAYS_BEFORE_DUE - 1)]
        : [addDays(due, -EARLY_DAYS_BEFORE_DUE), due],
    lateWithin7: [addDays(due, 1), addDays(due, 7)],
    lateWithin30: [addDays(due, 8), addDays(due, 30)],
    lateBeyond30: [addDays(due, 31), addDays(due, LATEST_RETURN_DAYS_AFTER_DUE)]
  }[bucket]
  return dayBetween(notBefore, notAfter, random, profile.worksWeekends)
}

/**
 * How many uploads a period gets: the profile's rate, varied by up to the
 * difference between it and one so a period always gets at least one.
 *
 * @param {number} perPeriod
 * @param {Random} random
 * @returns {number}
 */
const uploadCount = (perPeriod, random) =>
  Math.max(
    1,
    Math.round(perPeriod + (random.float() * 2 - 1) * (perPeriod - 1))
  )

/**
 * @typedef {Object} RegistrationContext - everything one registration's events are drawn from
 * @property {PlannedOperator} operator
 * @property {PlannedRegistration} registration
 * @property {PlannedRegistrationRows | undefined} rows
 * @property {Calibration} calibration
 * @property {Random} random
 * @property {string} to
 * @property {Draft[]} drafts
 */

/**
 * @param {RegistrationContext} context
 * @param {string} day
 * @param {Drafted<CalendarEvent>} event
 */
function draft(context, day, event) {
  context.drafts.push({ day, sequence: context.drafts.length, event })
}

/**
 * Amendments an upload carries: a share of the rows submitted before it,
 * restated with changed cells. The calibrated figure is the rows an accepted
 * upload updates, a month's worth like the rows it creates, so it is spread
 * across the uploads a period gets.
 *
 * @param {RegistrationContext} context
 * @param {string} stream
 * @param {Period} period
 * @returns {number}
 */
function amendmentCount(context, stream, period) {
  const { calibration, operator } = context
  const key = stream.startsWith('regOnly') ? 'registeredOnly' : stream
  return Math.round(
    (calibration.activity.rowsPerSubmission[key].updated *
      operator.profile.volumeFactor *
      MONTHS_PER_PERIOD[period.cadence]) /
      operator.profile.uploads.perReportingPeriod
  )
}

/**
 * What a rejected upload is rejected for, and the rows it is planted on.
 *
 * A row can only be missing if it was submitted before, so a first upload that
 * draws that kind is unreadable instead. An error sits on rows the upload
 * adds where it adds any, because that is where an operator's new mistakes
 * are, and only on a worksheet the service reads into the waste balance,
 * because those are the only rows it validates the cells of: a workbook with
 * none of those to plant on is rejected fatally instead.
 *
 * @param {RegistrationContext} context
 * @param {PlannedLogRow[]} submitted - rows carried by the last submitted upload
 * @param {PlannedLogRow[]} added - rows this upload carries for the first time
 * @returns {UploadIssues}
 */
function drawIssues(context, submitted, added) {
  const { random, operator, calibration } = context
  const sheets = context.rows ? SHEETS[context.rows.stream] : {}
  const validated = (added.length ? added : submitted).filter((row) => {
    const contribution = sheets[row.worksheet]?.contribution
    return contribution !== undefined && contribution !== CONTRIBUTION.NONE
  })
  const severity =
    validated.length === 0 ||
    random.float() < operator.profile.uploads.fatalShare
      ? ISSUE_SEVERITY.FATAL
      : ISSUE_SEVERITY.ERROR
  const drawn = random.weighted(calibration.activity.uploadIssueKinds[severity])
  const known = ISSUE_KINDS_BY_SEVERITY[severity].find((one) => one === drawn)
  if (!known) {
    throw new Error(
      `Calibration names "${drawn}" as a ${severity} upload issue, which is not one`
    )
  }
  const kind =
    known === ISSUE_KIND.REMOVED_ROW && submitted.length === 0
      ? ISSUE_KIND.UNREADABLE
      : known

  const pool =
    kind === ISSUE_KIND.REMOVED_ROW
      ? submitted
      : kind === ISSUE_KIND.UNREADABLE
        ? []
        : validated
  const rows = random
    .shuffle(pool)
    .slice(0, random.int(1, MAX_ROWS_WITH_ISSUES))
    .map(refOf)
  return { severity, kind, rows }
}

/**
 * One upload that lands, and the abandoned and rejected attempts before it on
 * the same day. Every attempt carries the same workbook, so the same cutoff and
 * amendments; what differs is what became of it.
 *
 * @param {RegistrationContext} context
 * @param {{day: string, cutoff: string, closedPeriods: string[], amendments: UploadEvent['amendments']}} upload
 * @param {PlannedLogRow[]} submitted
 * @param {PlannedLogRow[]} added
 * @returns {Drafted<UploadEvent>} the upload that landed
 */
function draftUploadAttempts(context, upload, submitted, added) {
  const { random, operator, registration } = context
  const { uploads } = operator.profile
  const base = {
    type: EVENT.SUMMARY_LOG_UPLOADED,
    registrationId: registration.id,
    cutoff: upload.cutoff,
    amendments: upload.amendments,
    // One list shared by every attempt, so a restatement added to the landing
    // upload later is in the workbook its rejected attempts carried too.
    restated: [],
    closedPeriods: upload.closedPeriods
  }

  if (random.float() < uploads.abandonRate) {
    draft(context, upload.day, {
      ...base,
      outcome: UPLOAD_OUTCOME.ABANDONED,
      issues: null
    })
  }
  if (random.float() < uploads.rejectionRate) {
    for (
      let attempt = 0;
      attempt < uploads.extraAttemptsWhenRejected;
      attempt++
    ) {
      draft(context, upload.day, {
        ...base,
        outcome: UPLOAD_OUTCOME.REJECTED,
        issues: drawIssues(context, submitted, added)
      })
    }
  }

  const landed = { ...base, outcome: UPLOAD_OUTCOME.SUBMITTED, issues: null }
  draft(context, upload.day, landed)
  return landed
}

/**
 * The uploads and reports of one registration's periods.
 *
 * Each period gets a closing upload after it ends, carrying everything to
 * date, before its report is filed; and the rest of its uploads inside it.
 * A report is filed against the deadline on the operator's punctuality, or
 * missed, and a period still open today is not owed at all.
 *
 * @param {RegistrationContext} context
 * @param {Period[]} periods
 * @param {string} activityEnd - the last day a load is recorded
 * @param {string} filingEnd - the last day an upload or report is made
 * @returns {string | null} the day of the first upload that landed, if any did
 */
function draftReporting(context, periods, activityEnd, filingEnd) {
  const { random, operator, registration, rows } = context
  const { profile } = operator
  const allRows = rows?.rows ?? []
  const stream = rows?.stream ?? ''

  /** @type {{day: string, period: Period}[]} */
  const reports = []
  /** @type {{day: string, period: Period}[]} */
  const uploads = []

  for (const period of periods) {
    const owed = period.end <= activityEnd
    const filed = owed ? reportDay(period, profile, random) : null
    const report = filed && filed <= filingEnd ? filed : null
    if (report) reports.push({ day: report, period })

    const count = uploadCount(profile.uploads.perReportingPeriod, random)
    const closingBy = report ?? earlier(period.due, filingEnd)
    const closingFrom = addDays(period.end, 1)
    const ranges = [
      ...Array.from({ length: count - 1 }, () => [period.first, period.last]),
      ...(closingFrom <= closingBy ? [[closingFrom, closingBy]] : [])
    ]
    for (const [notBefore, notAfter] of ranges) {
      const day = dayBetween(notBefore, notAfter, random, profile.worksWeekends)
      if (day) uploads.push({ day, period })
    }
  }
  uploads.sort((a, b) => a.day.localeCompare(b.day))

  /** @type {{day: string, event: Drafted<UploadEvent>, period: Period}[]} */
  const landed = []
  /** @type {string | null} */
  let submittedCutoff = null
  for (const upload of uploads) {
    const carried = allRows.filter((row) => row.date <= upload.day)
    if (carried.length === 0) continue
    const before = submittedCutoff ?? ''
    const submitted = allRows.filter((row) => row.date <= before)
    const added = carried.filter((row) => row.date > before)
    const closedPeriods = reports
      .filter((report) => report.day < upload.day)
      .flatMap((report) => report.period.months)
    const amendable = submitted.filter(
      (row) => !closedPeriods.includes(row.period)
    )

    const event = draftUploadAttempts(
      context,
      {
        day: upload.day,
        cutoff: upload.day,
        closedPeriods,
        amendments:
          submitted.length === 0
            ? null
            : {
                count: Math.min(
                  amendable.length,
                  amendmentCount(context, stream, upload.period)
                ),
                seed: `${context.random.int(1, 2 ** 31 - 1)}`
              }
      },
      submitted,
      added
    )
    landed.push({ day: upload.day, event, period: upload.period })
    submittedCutoff = upload.day
  }

  for (const report of reports) {
    const { period } = report
    draft(context, report.day, {
      type: EVENT.REPORT_SUBMITTED,
      registrationId: registration.id,
      year: period.year,
      cadence: period.cadence,
      period: period.period,
      submissionNumber: 1
    })

    if (random.float() >= profile.reporting.restatementRate) continue
    const restating = landed.find((upload) => upload.day > report.day)
    const restatable = allRows.filter(
      (row) => period.months.includes(row.period) && row.date <= period.last
    )
    if (!restating || restatable.length === 0) continue

    restating.event.restated.push(
      refOf(restatable[random.int(0, restatable.length - 1)])
    )
    const resubmitted = dayBetween(
      addDays(restating.day, 1),
      addDays(restating.day, RESUBMISSION_DAYS_AFTER_UPLOAD),
      random,
      profile.worksWeekends
    )
    if (!resubmitted || resubmitted > filingEnd) continue
    draft(context, resubmitted, {
      type: EVENT.REPORT_SUBMITTED,
      registrationId: registration.id,
      year: period.year,
      cadence: period.cadence,
      period: period.period,
      submissionNumber: 2
    })
  }

  return landed[0]?.day ?? null
}

/**
 * The PRN lifecycle of one accredited registration: so many a month, each
 * drafted, raised and issued within days, then accepted this month or next,
 * left waiting, or taken off one of the three exits. A note is issued against
 * the balance the uploads have built, so none is drafted before the first
 * summary log is submitted.
 *
 * @param {RegistrationContext} context
 * @param {string} first - the first day a note may be drafted
 * @param {string} issuingEnd - the last day the accreditation can issue
 */
function draftPrns(context, first, issuingEnd) {
  if (first > issuingEnd) return
  const { random, operator, registration, calibration } = context
  const { profile } = operator
  const { prn } = profile
  const mean =
    calibration.activity.prnsPerAccreditationPerMonth * profile.volumeFactor
  let serial = 0

  /**
   * A step later in the chain, or null once it falls off the end of the window.
   *
   * @param {string} day
   * @param {number} within - days
   */
  const step = (day, within) => {
    const moved = addDays(day, random.int(within === 0 ? 0 : 1, within))
    const landed = profile.worksWeekends
      ? moved
      : onWorkingDay(moved, moved, addDays(moved, 7))
    return landed <= issuingEnd ? landed : null
  }
  /**
   * @param {string} prnId
   * @param {string} from
   * @param {[PrnEvent['type'], number][]} steps - each type and the days it takes
   */
  const chain = (prnId, from, steps) => {
    /** @type {string | null} */
    let day = from
    for (const [type, within] of steps) {
      day = day && step(day, within)
      if (!day) return
      draft(context, day, { type, registrationId: registration.id, prnId })
    }
  }

  let month = monthKey(first)
  while (`${month}-01` <= issuingEnd) {
    const [year, monthNumber] = month.split('-').map(Number)
    const notBefore = later(first, `${month}-01`)
    const notAfter = earlier(lastDayOfMonth(year, monthNumber), issuingEnd)
    const count = random.int(0, Math.round(mean * 2))

    for (let index = 0; index < count; index++) {
      const prnId = `${registration.id}-PRN${String(++serial).padStart(3, '0')}`
      const drafted = dayBetween(
        notBefore,
        notAfter,
        random,
        profile.worksWeekends
      )
      if (!drafted) continue
      draft(context, drafted, {
        type: EVENT.PRN_DRAFTED,
        registrationId: registration.id,
        prnId
      })

      if (random.float() < prn.discardRate) {
        chain(prnId, drafted, [[EVENT.PRN_DISCARDED, PRN_STEP_DAYS]])
        continue
      }
      const raised = step(drafted, 0)
      if (!raised) continue
      draft(context, raised, {
        type: EVENT.PRN_RAISED,
        registrationId: registration.id,
        prnId
      })

      if (random.float() < prn.deleteRate) {
        chain(prnId, raised, [[EVENT.PRN_DELETED, PRN_STEP_DAYS]])
        continue
      }
      const issued = step(raised, PRN_STEP_DAYS)
      if (!issued) continue
      draft(context, issued, {
        type: EVENT.PRN_ISSUED,
        registrationId: registration.id,
        prnId
      })

      if (random.float() < prn.cancelRate) {
        chain(prnId, issued, [
          [EVENT.PRN_CANCELLATION_REQUESTED, PRN_CANCELLATION_REQUEST_DAYS],
          [EVENT.PRN_CANCELLED, PRN_STEP_DAYS]
        ])
        continue
      }
      if (random.float() >= prn.producerAcceptRate) continue

      const [issuedYear, issuedMonth] = issued.split('-').map(Number)
      const issuedMonthEnd = lastDayOfMonth(issuedYear, issuedMonth)
      const sameMonth =
        random.float() < prn.sameMonthAcceptanceShare && issued < issuedMonthEnd
      const [acceptFrom, acceptTo] = sameMonth
        ? [addDays(issued, 1), issuedMonthEnd]
        : [
            later(addDays(issued, 1), addDays(issuedMonthEnd, 1)),
            lastDayOfMonth(issuedYear, issuedMonth + 1)
          ]
      const accepted = dayBetween(
        acceptFrom,
        acceptTo,
        random,
        profile.worksWeekends
      )
      if (!accepted || accepted > issuingEnd) continue
      draft(context, accepted, {
        type: EVENT.PRN_ACCEPTED,
        registrationId: registration.id,
        prnId
      })
    }

    month = monthKey(addDays(lastDayOfMonth(year, monthNumber), 1))
  }
}

/**
 * Every event of one registration, in the order they happen.
 *
 * @param {RegistrationContext} context
 * @param {string} from
 * @returns {CalendarEvent[]}
 */
function planRegistration(context, from) {
  const { registration, random, to, calibration } = context
  const first = later(registration.activeFrom, from)
  const last = earlier(to, registration.accreditation?.validTo ?? to)
  if (first > last) return []

  draft(context, first, {
    type: EVENT.REGISTRATION_APPROVED,
    registrationId: registration.id
  })

  const change = statusChange(registration, first, last, random)
  if (change) {
    draft(context, change.day, {
      type: change.type,
      registrationId: registration.id
    })
  }
  const cancelled = change?.type === EVENT.ACCREDITATION_CANCELLED
  const activityEnd = change && cancelled ? addDays(change.day, -1) : last
  const filingEnd = cancelled ? activityEnd : to
  const issuingEnd = change ? addDays(change.day, -1) : last

  if (first <= activityEnd) {
    const firstSubmitted = draftReporting(
      context,
      reportingPeriods(
        registration,
        first,
        activityEnd,
        calibration.punctuality.dueDay
      ),
      activityEnd,
      filingEnd
    )
    if (registration.accreditation && firstSubmitted) {
      draftPrns(context, addDays(firstSubmitted, 1), issuingEnd)
    }
  }

  return timestamp(context.drafts, context.operator.id, random)
}

/**
 * Give each event a time of day inside working hours, keeping the order the
 * plan drew them in: a later event on the same day is always later in the day,
 * if only by a second.
 *
 * @param {Draft[]} drafts
 * @param {string} organisationId
 * @param {Random} random
 * @returns {CalendarEvent[]}
 */
function timestamp(drafts, organisationId, random) {
  const ordered = [...drafts].sort(
    (a, b) => a.day.localeCompare(b.day) || a.sequence - b.sequence
  )
  let previous = 0
  return ordered.map(({ day, event }) => {
    const drawn =
      parse(day).getTime() +
      random.int(WORKING_HOURS.first, WORKING_HOURS.last) * 60 * MINUTE_MS +
      random.int(0, 59) * MINUTE_MS +
      random.int(0, 59) * SECOND_MS
    const at = Math.max(drawn, previous + SECOND_MS)
    previous = at
    return {
      ...event,
      organisationId,
      at: new Date(at).toISOString()
    }
  })
}

/**
 * Plans every event of every operator between two dates.
 *
 * @param {Object} options
 * @param {PlannedPopulation} options.population
 * @param {PlannedRows} options.rows - the row plan the uploads draw on
 * @param {string} [options.from] - ISO date, defaults to the day the register went live
 * @param {string} [options.to] - ISO date, defaults to today
 * @param {Calibration} [options.calibration]
 * @returns {PlannedCalendar}
 */
export function planCalendar({
  population,
  rows,
  from,
  to = today(),
  calibration = DEFAULT_CALIBRATION
}) {
  const start = from ?? calibration.register.activeFrom.goLive
  if (start > to) {
    throw new Error(
      `The calendar runs from ${start} to ${to}, which is before it starts`
    )
  }
  const seed = `${population.seed}/calendar/${start}/${to}`
  const rowsByRegistration = new Map(
    rows.registrations.map((planned) => [planned.registrationId, planned])
  )

  return {
    seed,
    from: start,
    to,
    operators: population.organisations.map((operator) => ({
      organisationId: operator.id,
      events: operator.registrations
        .flatMap((registration) =>
          planRegistration(
            {
              operator,
              registration,
              rows: rowsByRegistration.get(registration.id),
              calibration,
              random: createRandom(`${seed}/${registration.id}`),
              to,
              drafts: []
            },
            start
          )
        )
        .sort((a, b) => a.at.localeCompare(b.at))
    }))
  }
}

/**
 * The rows an upload carries, as the workbook is rendered from them: every
 * planned row dated up to its cutoff, restated as every submitted upload
 * before it restated them, with this upload's own issue planted on top.
 *
 * `uploads` is the registration's upload events up to and including the one to
 * render, in order. An unreadable upload returns its rows untouched; the
 * workbook is broken at the generator, not in the rows.
 *
 * @param {Object} options
 * @param {PlannedRegistrationRows} options.registration
 * @param {UploadEvent[]} options.uploads
 * @returns {PlannedLogRow[]}
 */
export function uploadRows({ registration, uploads }) {
  const upload = uploads[uploads.length - 1]
  if (!upload) throw new Error('No upload to render the rows of')

  /** @type {Map<string, number>} */
  const seeds = new Map()
  /** @type {string | null} */
  let submittedCutoff = null
  for (const earlierUpload of uploads) {
    const rendering = earlierUpload === upload
    if (!rendering && earlierUpload.outcome !== UPLOAD_OUTCOME.SUBMITTED)
      continue

    if (earlierUpload.amendments) {
      const { count, seed } = earlierUpload.amendments
      const closed = new Set(earlierUpload.closedPeriods)
      const pool = registration.rows.filter(
        (row) =>
          submittedCutoff !== null &&
          row.date <= submittedCutoff &&
          !closed.has(row.period)
      )
      for (const row of createRandom(seed).shuffle(pool).slice(0, count)) {
        seeds.set(rowKey(row), reseed(row, seed))
      }
    }
    for (const ref of earlierUpload.restated) {
      const row = registration.rows.find(
        (row) => row.worksheet === ref.worksheet && row.rowId === ref.rowId
      )
      if (!row) {
        throw new Error(
          `${registration.registrationId} restates row ${ref.rowId} of ${ref.worksheet}, which it never planned`
        )
      }
      seeds.set(rowKey(row), reseed(row, earlierUpload.cutoff))
    }
    if (rendering) break
    submittedCutoff = earlierUpload.cutoff
  }

  const carried = registration.rows
    .filter((row) => row.date <= upload.cutoff)
    .map((row) => {
      const seed = seeds.get(rowKey(row))
      return seed === undefined ? row : { ...row, seed }
    })
  return withIssues(carried, registration.stream, upload.issues)
}

/**
 * @param {PlannedLogRow[]} rows
 * @param {string} stream
 * @param {UploadIssues | null} issues
 * @returns {PlannedLogRow[]}
 */
function withIssues(rows, stream, issues) {
  if (!issues || issues.kind === ISSUE_KIND.UNREADABLE) return rows
  const planted = new Set(issues.rows.map(rowKey))

  if (issues.kind === ISSUE_KIND.REMOVED_ROW) {
    return rows.filter((row) => !planted.has(rowKey(row)))
  }
  return rows.map((row) => {
    if (!planted.has(rowKey(row))) return row
    const sheet = SHEETS[stream][row.worksheet]
    const marker =
      Object.keys(sheet.dateFields ?? {})[0] ?? sheet.monthFields?.[0]
    const value = issues.kind === ISSUE_KIND.BLANK_FIELD ? '' : 'not a date'
    return { ...row, fields: { ...row.fields, [marker]: value } }
  })
}
