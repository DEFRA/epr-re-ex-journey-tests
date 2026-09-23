/**
 * Plans every summary log row a population reports across a year.
 *
 * Pure and seeded, like the population planner it reads: nothing here calls an
 * API, reads a clock or touches the filesystem, and the same seed always gives
 * the same rows. See README.md for the row shape and for what a caller has to
 * arrange before a planned row can count.
 */

import { WORKSHEET_CONFIG } from '../../spreadsheet/spreadsheet-config.js'
import { lastLoadDay, statusChangeOf } from '../calendar/calendar.js'
import { DEFAULT_CALIBRATION } from '../population/calibration.js'
import { allocate, createRandom } from '../population/random.js'
import { CONTRIBUTION, SHEETS, heldTonnage } from './sheets.js'

/** @import {PlannedPopulation, PlannedRegistration} from '../population/population.js' */
/** @import {Calibration} from '../population/calibration.js' */
/** @import {Random} from '../population/random.js' */

export { CONTRIBUTION }

/**
 * @typedef {Object} PlannedLogRow
 * @property {number} rowId - unique within its worksheet, ascending through the year
 * @property {string} worksheet - the worksheet it is rendered into
 * @property {string} period - the month it belongs to, `YYYY-MM`
 * @property {string} date - the day it happened, ISO
 * @property {'credit' | 'debit' | 'none'} contribution - what it does to the waste balance
 * @property {number} tonnage - what it moves once the service has read the cells, held to the two decimals the service keeps; 0 where it moves nothing
 * @property {Record<string, string | number>} fields - cells to pin, keyed by template marker
 * @property {number} seed - draws every cell the plan leaves alone
 */

/**
 * @typedef {Object} PlannedRegistrationRows
 * @property {string} registrationId
 * @property {string} organisationId
 * @property {string} stream - which of the generator's five templates it renders as
 * @property {{id: number, validFrom: string} | null} overseasSite - the site every exported row names; null off the exporting streams
 * @property {PlannedLogRow[]} rows - the whole year, in the order the log requires
 */

/**
 * @typedef {Object} SheetPlan - one entry of `SHEETS`, keyed by worksheet
 * @property {'credit' | 'debit' | 'none'} contribution
 * @property {Record<string, number>} [dateFields] - date markers, each with its offset in days from the row's day
 * @property {string} [balanceDate] - the date marker the service dates the credit by, where that is not the row's own day
 * @property {string[]} [monthFields] - markers a registered-only template takes as a month
 * @property {Record<string, string | number>} [fields] - cells pinned whatever the row carries
 * @property {(tonnage: number, random: Random, calibration: Calibration) => {fields: Record<string, string | number>, tonnage: number}} [load]
 */

/**
 * @typedef {Object} ReportingMonth - a month of a registration's year, cut to its accreditation window
 * @property {Date} first
 * @property {Date} last
 */

/**
 * @typedef {Object} RegistrationPlan - everything one registration's rows are drawn from
 * @property {PlannedRegistration} registration
 * @property {string} stream
 * @property {ReportingMonth[]} months
 * @property {Record<string, number>} rowCounts - rows per month, keyed by worksheet
 */

/**
 * @typedef {Object} PlannedRows
 * @property {string} seed
 * @property {number} year
 * @property {PlannedRegistrationRows[]} registrations
 */

/**
 * The overseas reprocessor every exported row names. The service needs the site
 * to exist and its approval to cover each row's export date, which is the
 * executor's to arrange from `overseasSite`.
 */
const OVERSEAS_SITE_ID = 100

/** The share of its figures a stream reports when no other stream divides them with it. */
const WHOLE_ESTATE = 1

/** The rows a registered-only registration reports, whichever template it is on. */
const REGISTERED_ONLY = 'registeredOnly'

/**
 * How far a month's draw sits from one, either way, before a registration's
 * months are brought back to a mean of exactly one.
 */
const MONTHLY_VARIATION = 0.3

const DAY_MS = 24 * 60 * 60 * 1000

const iso = (date) => date.toISOString().slice(0, 10)

/** `dd/mm/yyyy`, which is how the generator recognises a cell as a date. */
const ukDate = (date) => iso(date).split('-').reverse().join('/')

const dayOf = (year, month, day) => new Date(Date.UTC(year, month, day))

const addDays = (date, days) =>
  dayOf(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days)

const lastDayOf = (year, month) => new Date(Date.UTC(year, month + 1, 0))

const daysBetween = (from, to) =>
  Math.round((to.getTime() - from.getTime()) / DAY_MS)

/**
 * Which of the generator's five streams a registration renders as.
 *
 * The population plans a registration as exporting or reprocessing and leaves
 * the input and output split here on purpose, so this is the one place that
 * decides it. An unaccredited registration reports on the shorter
 * registered-only template of its type, which has no such split.
 *
 * @param {Pick<PlannedRegistration, 'processingType' | 'accreditation'>} registration
 * @param {string} [reprocessorStream] - the stream a reprocessing registration was allocated
 * @returns {string}
 */
export function streamFor(registration, reprocessorStream) {
  if (registration.processingType === 'exporter') {
    return registration.accreditation ? 'exporter' : 'regOnlyExporter'
  }
  if (!registration.accreditation) {
    return 'regOnlyReprocessor'
  }
  return reprocessorStream ?? 'reprocessorInput'
}

/**
 * Hands the accredited reprocessing registrations out between the input and
 * output streams as a quota, so every scale lands on the calibrated split
 * rather than drifting from it on a small run.
 *
 * @param {PlannedRegistration[]} registrations
 * @param {Calibration} calibration
 * @param {Random} random
 * @returns {Map<string, string>} registration id to stream
 */
function allocateStreams(registrations, calibration, random) {
  const reprocessing = registrations.filter(
    (registration) =>
      registration.processingType === 'reprocessor' &&
      registration.accreditation
  )
  const streams = allocate(
    calibration.activity.reprocessorStream,
    reprocessing.length,
    random
  )
  return new Map(
    reprocessing.map((registration, index) => [registration.id, streams[index]])
  )
}

/**
 * The worksheets of a stream, refusing a calibration that names a different set
 * from the templates.
 *
 * A worksheet the calibration omits would otherwise plan no rows at all and say
 * nothing, and one it misspells would be ignored the same way — the silence the
 * calibration's own overlay guard exists to prevent.
 *
 * @param {string} stream
 * @param {Calibration} calibration
 * @returns {Record<string, SheetPlan>}
 */
function sheetsOf(stream, calibration) {
  const planned = SHEETS[stream]
  const calibrated = calibration.activity.summaryLogSheets[stream] ?? {}
  const disagreements = [
    ...Object.keys(planned).filter((name) => !(name in calibrated)),
    ...Object.keys(calibrated).filter((name) => !(name in planned))
  ]
  if (disagreements.length) {
    throw new Error(
      `Calibration and templates disagree on ${stream} worksheets: ${disagreements.join(', ')}`
    )
  }
  return planned
}

/**
 * The months a registration reports, which start when it went active and stop
 * at the end of its accreditation window, or on the last day the calendar's
 * suspension or cancellation leaves it recording loads.
 *
 * A row dated outside that window, or after that day, is ignored or never
 * uploaded, and over a simulated year that is the likeliest way for a whole
 * period's tonnage to vanish, so the months are cut here rather than left for
 * the service to find.
 *
 * @param {PlannedRegistration} registration
 * @param {number} year
 * @param {PlannedPopulation['seed']} populationSeed
 * @returns {ReportingMonth[]}
 */
function reportingMonths(registration, year, populationSeed) {
  const opened = new Date(`${registration.activeFrom}T00:00:00Z`)
  const change = statusChangeOf(registration, populationSeed)
  const lastDay = change
    ? lastLoadDay(change)
    : registration.accreditation?.validTo
  const closed = lastDay
    ? new Date(`${lastDay}T00:00:00Z`)
    : lastDayOf(year, 11)

  const months = []
  for (let month = 0; month < 12; month++) {
    const first = dayOf(year, month, 1)
    const last = lastDayOf(year, month)
    if (last < opened || first > closed) continue
    months.push({
      first: first < opened ? opened : first,
      last: last > closed ? closed : last
    })
  }
  return months
}

/**
 * How many rows each worksheet takes of a registration's month.
 *
 * The calibrated figure is the rows an accepted upload carries, and a
 * registration answers one monthly return, so a month's worth is one upload's
 * worth. How many uploads carry them is the calendar planner's to decide.
 *
 * @param {string} stream
 * @param {number} volumeFactor
 * @param {Calibration} calibration
 * @returns {Record<string, number>} rows per month, keyed by worksheet
 */
function rowsPerMonth(stream, volumeFactor, calibration) {
  const key = stream.startsWith('regOnly') ? REGISTERED_ONLY : stream
  const total = Math.max(
    1,
    Math.round(
      calibration.activity.rowsPerSubmission[key].created * volumeFactor
    )
  )
  const calibrated = calibration.activity.summaryLogSheets[stream]
  return Object.fromEntries(
    Object.keys(sheetsOf(stream, calibration)).map((worksheet) => [
      worksheet,
      Math.max(1, Math.round(total * calibrated[worksheet].rowShare))
    ])
  )
}

/**
 * The share of the reprocessor estate's year each reprocessing stream reports,
 * by registration-months.
 *
 * The workbook's reprocessor figures are the whole estate's, and the input and
 * output templates are two ways one estate reports the same process.
 *
 * @param {RegistrationPlan[]} plans
 * @param {Calibration} calibration
 * @returns {Map<string, number>} stream to share, for the reprocessing streams only
 */
function reprocessorStreamShares(plans, calibration) {
  /** @type {Record<string, number>} */
  const months = Object.fromEntries(
    Object.keys(calibration.activity.reprocessorStream).map((stream) => [
      stream,
      0
    ])
  )
  for (const plan of plans) {
    if (plan.stream in months) months[plan.stream] += plan.months.length
  }
  const estate = Object.values(months).reduce((sum, count) => sum + count, 0)
  return new Map(
    Object.entries(months).map(([stream, count]) => [
      stream,
      estate ? count / estate : 0
    ])
  )
}

/**
 * What one row of a worksheet carries, so that the estate's year lands on the
 * tonnage the calibration reports for that worksheet.
 *
 * Scaled with the population, so a tenth-scale run credits a tenth of the
 * national tonnage rather than crediting the whole of it ten times over. It
 * follows that raising the rows a submission carries shrinks the load behind
 * each row rather than inflating the year's tonnage.
 *
 * @param {RegistrationPlan[]} plans
 * @param {number} scale
 * @param {Calibration} calibration
 * @returns {Map<string, number>} `<stream>/<worksheet>` to tonnes per row
 */
function tonnagePerRow(plans, scale, calibration) {
  const rowsBySheet = new Map()
  for (const plan of plans) {
    for (const [worksheet, count] of Object.entries(plan.rowCounts)) {
      const key = `${plan.stream}/${worksheet}`
      rowsBySheet.set(
        key,
        (rowsBySheet.get(key) ?? 0) + count * plan.months.length
      )
    }
  }

  const shares = reprocessorStreamShares(plans, calibration)
  const perRow = new Map()
  for (const [stream, sheets] of Object.entries(
    calibration.activity.summaryLogSheets
  )) {
    const share = shares.get(stream) ?? WHOLE_ESTATE
    const planned = sheetsOf(stream, calibration)
    for (const [worksheet, { monthlyTonnage }] of Object.entries(sheets)) {
      if (monthlyTonnage === undefined) continue
      if (!planned[worksheet].load) {
        throw new Error(
          `Calibration gives ${stream} worksheet "${worksheet}" a monthlyTonnage, but no row on it carries a load`
        )
      }
      const rows = rowsBySheet.get(`${stream}/${worksheet}`)
      if (!rows) continue
      perRow.set(
        `${stream}/${worksheet}`,
        (monthlyTonnage * share * scale * 12) / rows
      )
    }
  }
  return perRow
}

/**
 * Plans every summary log row the population reports across `year`.
 *
 * @param {Object} options
 * @param {PlannedPopulation} options.population
 * @param {number} [options.year] - defaults to the year the register went live
 * @param {Calibration} [options.calibration]
 * @returns {PlannedRows}
 */
export function planSummaryLogRows({
  population,
  year,
  calibration = DEFAULT_CALIBRATION
}) {
  const reportingYear =
    year ?? Number(calibration.register.activeFrom.goLive.slice(0, 4))
  const seed = `${population.seed}/rows/${reportingYear}`

  const registrations = population.organisations.flatMap((operator) =>
    operator.registrations.map((registration) => ({
      registration,
      volumeFactor: operator.profile.volumeFactor
    }))
  )
  const streams = allocateStreams(
    registrations.map(({ registration }) => registration),
    calibration,
    createRandom(`${seed}/streams`)
  )

  const plans = registrations.map(({ registration, volumeFactor }) => {
    const stream = streamFor(registration, streams.get(registration.id))
    return {
      registration,
      stream,
      months: reportingMonths(registration, reportingYear, population.seed),
      rowCounts: rowsPerMonth(stream, volumeFactor, calibration)
    }
  })

  const perRow = tonnagePerRow(plans, population.scale, calibration)

  return {
    seed,
    year: reportingYear,
    registrations: plans.map((plan) =>
      planRegistration(
        plan,
        perRow,
        calibration,
        createRandom(`${seed}/${plan.registration.id}`),
        createRandom(`${seed}/${plan.registration.id}/months`)
      )
    )
  }
}

/**
 * One registration's year, worksheet by worksheet within each month, so the
 * rows come out in the order the log requires and a row id only ever climbs.
 *
 * @param {RegistrationPlan} plan
 * @param {Map<string, number>} perRow
 * @param {Calibration} calibration
 * @param {Random} random
 * @param {Random} variation - draws what each month carries of the mean
 * @returns {PlannedRegistrationRows}
 */
function planRegistration(plan, perRow, calibration, random, variation) {
  const { registration, stream, months, rowCounts } = plan
  const identity = {
    registrationId: registration.id,
    organisationId: registration.organisationId,
    stream
  }
  if (months.length === 0) return { ...identity, overseasSite: null, rows: [] }

  const window = {
    first: months[0].first,
    last: months[months.length - 1].last
  }
  const nextRowId = new Map()
  const rows = []
  const factors = monthlyFactors(months.length, variation)

  months.forEach((month, index) => {
    for (const [worksheet, sheet] of Object.entries(
      sheetsOf(stream, calibration)
    )) {
      const tonnage = perRow.get(`${stream}/${worksheet}`)
      for (let row = 0; row < rowCounts[worksheet]; row++) {
        const rowId =
          nextRowId.get(worksheet) ?? WORKSHEET_CONFIG[stream][worksheet].rowId
        nextRowId.set(worksheet, rowId + 1)
        rows.push(
          planRow({
            rowId,
            worksheet,
            sheet,
            month,
            window,
            random,
            tonnage:
              tonnage === undefined ? undefined : tonnage * factors[index],
            calibration
          })
        )
      }
    }
  })

  const exporting = stream === 'exporter' || stream === 'regOnlyExporter'
  return {
    ...identity,
    overseasSite: exporting
      ? { id: OVERSEAS_SITE_ID, validFrom: earliestDate(rows) }
      : null,
    rows
  }
}

/**
 * A factor for each of a registration's months, drawn within
 * `MONTHLY_VARIATION` of one and then scaled so they average exactly one. A
 * registration's year is therefore what it was before the months moved, and so
 * is the estate's.
 *
 * Drawn from its own seed rather than the registration's, so the days its rows
 * fall on, and everything the calendar plans from them, hold still when the
 * variation changes.
 *
 * @param {number} count
 * @param {Random} random
 * @returns {number[]}
 */
function monthlyFactors(count, random) {
  const drawn = Array.from(
    { length: count },
    () => 1 + (random.float() * 2 - 1) * MONTHLY_VARIATION
  )
  const mean = drawn.reduce((sum, factor) => sum + factor, 0) / count
  return drawn.map((factor) => factor / mean)
}

/**
 * Planned rows in the shape `generateSummaryLogContent` takes them, keyed by
 * worksheet. Hand it whichever of a registration's rows an upload carries; a
 * worksheet none of them belong to gets no rows, as a worksheet the plan omits
 * does.
 *
 * @param {PlannedLogRow[]} rows
 * @returns {Record<string, {rowId: number, fields: Record<string, string | number>, seed: number}[]>}
 */
export function rowsForUpload(rows) {
  const byWorksheet = {}
  for (const { rowId, worksheet, fields, seed } of rows) {
    byWorksheet[worksheet] ??= []
    byWorksheet[worksheet].push({ rowId, fields, seed })
  }
  return byWorksheet
}

/**
 * @param {PlannedLogRow[]} rows
 * @returns {string}
 */
const earliestDate = (rows) =>
  rows.reduce(
    (earliest, row) => (row.date < earliest ? row.date : earliest),
    rows[0].date
  )

/**
 * One row: a day inside its month, the dates that day implies, and the cells
 * that decide what it does to the waste balance.
 *
 * Every date is pinned, because a date the generator draws relative to now
 * moves with the simulated clock even under a fixed seed, and a row that moves
 * between uploads reads as an amendment rather than a restatement.
 *
 * @param {Object} options
 * @param {number} options.rowId
 * @param {string} options.worksheet
 * @param {SheetPlan} options.sheet
 * @param {ReportingMonth} options.month
 * @param {ReportingMonth} options.window - every month the registration reports
 * @param {Random} options.random
 * @param {number} [options.tonnage] - tonnes this row carries, absent where the worksheet reports none
 * @param {Calibration} options.calibration
 * @returns {PlannedLogRow}
 */
function planRow({
  rowId,
  worksheet,
  sheet,
  month,
  window,
  random,
  tonnage,
  calibration
}) {
  const day = dayWithin(month, random)
  const fields = {}

  for (const [marker, offset] of Object.entries(sheet.dateFields ?? {})) {
    fields[marker] = ukDate(clamp(addDays(day, offset), month, window))
  }
  for (const marker of sheet.monthFields ?? []) {
    fields[marker] = ukDate(dayOf(day.getUTCFullYear(), day.getUTCMonth(), 1))
  }
  Object.assign(fields, sheet.fields)

  const load =
    sheet.load && tonnage !== undefined
      ? sheet.load(tonnage, random, calibration)
      : null
  const moves = load ? heldTonnage(load.tonnage) : 0

  return {
    rowId,
    worksheet,
    period: iso(day).slice(0, 7),
    date: iso(day),
    // What the row does, not where it sits: a stopped or refused load is on a
    // crediting worksheet and still moves nothing, and a sheet the service
    // never classifies reports a tonnage that reaches no balance at all.
    contribution: moves ? sheet.contribution : CONTRIBUTION.NONE,
    tonnage: sheet.contribution === CONTRIBUTION.NONE ? 0 : moves,
    fields: { ...fields, ...load?.fields },
    seed: random.int(1, 2 ** 31 - 1)
  }
}

/**
 * Any day of the month the row is reported for.
 *
 * @param {ReportingMonth} month
 * @param {Random} random
 * @returns {Date}
 */
const dayWithin = (month, random) =>
  addDays(month.first, random.int(0, daysBetween(month.first, month.last)))

/**
 * Holds a date no earlier than the row's month and no later than the
 * registration's reporting window. A later date may run into the month after,
 * which is still open: an exported row is checked for accreditation on both
 * its export date and the date the overseas reprocessor received it, and a
 * receipt three weeks after an export late in the month is not late. An
 * earlier date may not, because the service files a row under every date it
 * carries, and the month before may already be reported.
 *
 * @param {Date} date
 * @param {ReportingMonth} month
 * @param {ReportingMonth} window
 * @returns {Date}
 */
function clamp(date, month, window) {
  if (date < month.first) return month.first
  if (date > window.last) return window.last
  return date
}
