/**
 * Plans every summary log row a population reports across a year.
 *
 * Pure and seeded, like the population planner it reads: nothing here calls an
 * API, reads a clock or touches the filesystem, and the same seed always gives
 * the same rows. See README.md for the row shape and for what a caller has to
 * arrange before a planned row can count.
 */

import { WORKSHEET_CONFIG } from '../../spreadsheet/spreadsheet-config.js'
import { DEFAULT_CALIBRATION } from '../population/calibration.js'
import { allocate, createRandom } from '../population/random.js'
import { CONTRIBUTION, SHEETS } from './sheets.js'

/** @import {PlannedPopulation, PlannedRegistration} from '../population/population.js' */
/** @import {Calibration} from '../population/calibration.js' */

export { CONTRIBUTION }

/**
 * @typedef {Object} PlannedLogRow
 * @property {number} rowId - unique within its worksheet, ascending through the year
 * @property {string} worksheet - the worksheet it is rendered into
 * @property {string} period - the month it belongs to, `YYYY-MM`
 * @property {string} date - the day it happened, ISO
 * @property {'credit' | 'debit' | 'none'} contribution - what it does to the waste balance
 * @property {number} tonnage - what it moves once the service has read the cells; 0 where it moves nothing
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

/** The rows a registered-only registration reports, whichever template it is on. */
const REGISTERED_ONLY = 'registeredOnly'

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
 * The months a registration reports, which start when it went active and stop
 * at the end of its accreditation window.
 *
 * A row dated outside that window is ignored rather than counted, and over a
 * simulated year that is the likeliest way for a whole period's tonnage to
 * vanish, so the months are cut here rather than left for the service to find.
 *
 * @param {PlannedRegistration} registration
 * @param {number} year
 * @returns {{first: Date, last: Date}[]}
 */
function reportingMonths(registration, year) {
  const opened = new Date(`${registration.activeFrom}T00:00:00Z`)
  const closed = registration.accreditation
    ? new Date(`${registration.accreditation.validTo}T00:00:00Z`)
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
 */
function rowsPerMonth(stream, volumeFactor, calibration) {
  const key = stream.startsWith('regOnly') ? REGISTERED_ONLY : stream
  const total = Math.max(
    1,
    Math.round(
      calibration.activity.rowsPerSubmission[key].created * volumeFactor
    )
  )
  return Object.fromEntries(
    Object.entries(calibration.activity.summaryLogSheets[stream]).map(
      ([worksheet, { rowShare }]) => [
        worksheet,
        Math.max(1, Math.round(total * rowShare))
      ]
    )
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

  const perRow = new Map()
  for (const [stream, sheets] of Object.entries(
    calibration.activity.summaryLogSheets
  )) {
    for (const [worksheet, { monthlyTonnage }] of Object.entries(sheets)) {
      const rows = rowsBySheet.get(`${stream}/${worksheet}`)
      if (monthlyTonnage === undefined || !rows) continue
      perRow.set(`${stream}/${worksheet}`, (monthlyTonnage * scale * 12) / rows)
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
      months: reportingMonths(registration, reportingYear),
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
        createRandom(`${seed}/${plan.registration.id}`)
      )
    )
  }
}

/**
 * One registration's year, worksheet by worksheet within each month, so the
 * rows come out in the order the log requires and a row id only ever climbs.
 *
 * @returns {PlannedRegistrationRows}
 */
function planRegistration(plan, perRow, calibration, random) {
  const { registration, stream, months, rowCounts } = plan
  const nextRowId = new Map()
  const rows = []

  for (const month of months) {
    for (const [worksheet, sheet] of Object.entries(SHEETS[stream])) {
      for (let index = 0; index < rowCounts[worksheet]; index++) {
        const rowId =
          nextRowId.get(worksheet) ?? WORKSHEET_CONFIG[stream][worksheet].rowId
        nextRowId.set(worksheet, rowId + 1)
        rows.push(
          planRow({
            rowId,
            worksheet,
            sheet,
            month,
            random,
            tonnage: perRow.get(`${stream}/${worksheet}`),
            calibration
          })
        )
      }
    }
  }

  const exporting = stream === 'exporter' || stream === 'regOnlyExporter'
  return {
    registrationId: registration.id,
    organisationId: registration.organisationId,
    stream,
    overseasSite: exporting
      ? { id: OVERSEAS_SITE_ID, validFrom: earliestDate(rows) }
      : null,
    rows
  }
}

/**
 * Planned rows in the shape `generateSpreadsheetData` takes them, keyed by
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

const earliestDate = (rows) =>
  rows.reduce(
    (earliest, row) => (row.date < earliest ? row.date : earliest),
    '9999-12-31'
  )

/**
 * One row: a day inside its month, the dates that day implies, and the cells
 * that decide what it does to the waste balance.
 *
 * Every date is pinned, because a date the generator draws relative to now
 * moves with the simulated clock even under a fixed seed, and a row that moves
 * between uploads reads as an amendment rather than a restatement.
 *
 * @returns {PlannedLogRow}
 */
function planRow({
  rowId,
  worksheet,
  sheet,
  month,
  random,
  tonnage,
  calibration
}) {
  const day = dayWithin(month, sheet, random)
  const fields = {}

  for (const [marker, offset] of Object.entries(sheet.dateFields ?? {})) {
    fields[marker] = ukDate(clamp(addDays(day, offset), month))
  }
  for (const marker of sheet.monthFields ?? []) {
    fields[marker] = ukDate(dayOf(day.getUTCFullYear(), day.getUTCMonth(), 1))
  }

  const load =
    sheet.load && tonnage !== undefined
      ? sheet.load(tonnage, random, calibration)
      : null

  return {
    rowId,
    worksheet,
    period: iso(day).slice(0, 7),
    date: iso(day),
    // What the row does, not where it sits: a stopped or refused load is on a
    // crediting worksheet and still moves nothing.
    contribution: load?.tonnage ? sheet.contribution : CONTRIBUTION.NONE,
    tonnage: load?.tonnage ?? 0,
    fields: { ...fields, ...load?.fields },
    seed: random.int(1, 2 ** 31 - 1)
  }
}

/**
 * A day inside the month, leaving room for the offsets the sheet's other dates
 * take, so nothing has to be clamped into disagreeing with the day it follows.
 * A window of a few days at the edge of an accreditation has no such room, and
 * there the clamp is what keeps every date inside it.
 */
function dayWithin(month, sheet, random) {
  const offsets = Object.values(sheet.dateFields ?? {})
  const earliest = addDays(month.first, -Math.min(0, ...offsets, 0))
  const latest = addDays(month.last, -Math.max(0, ...offsets, 0))
  const span = daysBetween(earliest, latest)
  return span < 0
    ? addDays(month.first, random.int(0, daysBetween(month.first, month.last)))
    : addDays(earliest, random.int(0, span))
}

/** Holds a date inside the month it belongs to, so an offset cannot leave the window. */
function clamp(date, month) {
  if (date < month.first) return month.first
  if (date > month.last) return month.last
  return date
}
