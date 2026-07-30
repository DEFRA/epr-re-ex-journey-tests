/*
 * Generates the PAE-1783 "received but not exported" fixture by deriving it from
 * an existing (already-valid) sanity summary log, in the same way as
 * generate-reconciliation-fixtures.mjs.
 *
 * Why derive rather than hand-author: column S (tonnage received for export) is
 * an Excel formula cross-validated against net weight, non-target materials,
 * bailing wire protocol and recyclable proportion (epr-backend
 * validateTonnageExport), so a row's numbers must be internally consistent.
 * Real sanity rows already satisfy that. Column T (tonnage exported) carries no
 * such cross-check — it is a plain optional weight — so it is the one column we
 * can safely rewrite.
 *
 * Every kept load is given an in-period export date, because that is the shape
 * the pre-PAE-1783 calculation discarded: it dropped any load exported inside
 * the reporting period, so a load with an export date but no exported tonnage
 * read as fully exported. That makes the old rule return 0.00 for this fixture
 * and the new rule return the real remainder. See report.not.exported.exporter.
 * e2e.js for what the loads are and what the figure means.
 *
 * A load recording more exported than received is deliberately left out. The
 * calculation clamps it to zero, but that behaviour is still with the business,
 * so pinning it in a journey test would only have to be undone. Unit tests in
 * epr-backend cover it.
 *
 * Run: node resources/generate-not-exported-fixture.mjs
 *
 * Writes resources/exporter-not-exported.xlsx and prints the total the test
 * asserts. It refuses to emit a fixture the old rule would have got right,
 * since that would guard nothing. If the printed total changes, update
 * EXPECTED_TONNAGE_NOT_EXPORTED in report.not.exported.exporter.e2e.js.
 */
import ExcelJS from 'exceljs'

const SOURCE = 'resources/sanity/exporter_E-ACC12245PA_E25SR500020912PA.xlsx'
const OUT = 'resources/exporter-not-exported.xlsx'
const DATA_SHEET = 'Exported (sections 1, 2 and 3)'
const BLANK_SHEETS = ['Sent on (sections 4 and 5)']

const PERIOD = '2026-02' // the month the kept loads must sit in
const HEADER_ROW = 1 // machine-key header row
const FIRST_DATA_ROW = 4 // row 3 is the "Example" row - never treat it as data

/** ROUND_HALF_UP to 2dp, matching the backend roundToTwoDecimalPlaces. */
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100

/** Read the cell value, unwrapping ExcelJS formula results. */
const cellValue = (cell) => {
  const v = cell.value
  if (v && typeof v === 'object' && 'result' in v) {
    return v.result
  }
  return v
}

/** Map machine header keys (row 1) to column numbers. */
const headerMap = (ws) => {
  const map = {}
  ws.getRow(HEADER_ROW).eachCell((cell, col) => {
    if (typeof cell.value === 'string') {
      map[cell.value] = col
    }
  })
  return map
}

const isNo = (v) => v === undefined || v === null || String(v).trim() !== 'Yes'

const month = (v) =>
  v instanceof Date
    ? v.toISOString().slice(0, 7)
    : v
      ? String(v).slice(0, 7)
      : null

const wb = new ExcelJS.Workbook()
await wb.xlsx.readFile(SOURCE)
const ws = wb.getWorksheet(DATA_SHEET)
const cols = headerMap(ws)

const at = (row, key) =>
  cols[key] ? cellValue(row.getCell(cols[key])) : undefined

// The loads to keep, pinned by the summary log's own ROW_ID. Do not replace this
// with "the first N rows passing a filter": that was tried, and when PAE-1797
// cleared the refused and stopped flags across the sanity fixtures it silently
// selected different rows and produced a different fixture.
//
// The recorded tonnages are asserted below, so re-running this script after the
// source log changes fails instead of quietly emitting a different fixture. Note
// that nothing checks the committed .xlsx against its source automatically — the
// fixture stays valid either way, but its provenance only gets re-verified when
// somebody runs this.
//
// `role` is what this script does to column T: blank it, leave it, or raise it
// to match column S. `sourceReceived` / `sourceExported` are what the row
// currently holds — tripwires, not output, so a blanked row still records the
// exported tonnage it is about to lose.
const KEEP = [
  { rowId: 1000, role: 'blank', sourceReceived: 26.42, sourceExported: 2.55 },
  { rowId: 1016, role: 'blank', sourceReceived: 111.27, sourceExported: 2.61 },
  { rowId: 1012, role: 'partial', sourceReceived: 10.2, sourceExported: 1.21 },
  { rowId: 1002, role: 'full', sourceReceived: 4.11, sourceExported: 3.63 }
]

const expectations = new Map(KEEP.map((k) => [k.rowId, k]))
const chosen = []

for (let r = FIRST_DATA_ROW; r <= ws.rowCount; r++) {
  const row = ws.getRow(r)
  const expected = expectations.get(at(row, 'ROW_ID'))
  if (!expected) {
    continue
  }

  const received = round2(at(row, 'TONNAGE_RECEIVED_FOR_EXPORT'))
  const exported = round2(at(row, 'TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED'))
  const clean =
    isNo(at(row, 'DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE')) &&
    isNo(at(row, 'WAS_THE_WASTE_REFUSED')) &&
    isNo(at(row, 'WAS_THE_WASTE_STOPPED')) &&
    isNo(at(row, 'WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE')) &&
    String(at(row, 'OSR_ID')) === '100' &&
    month(at(row, 'DATE_RECEIVED_FOR_EXPORT')) === PERIOD &&
    month(at(row, 'DATE_OF_EXPORT')) === PERIOD

  if (!clean) {
    throw new Error(
      `ROW_ID ${expected.rowId} in ${SOURCE} no longer meets the conditions ` +
        `this fixture depends on; pick a different row and update KEEP.`
    )
  }
  if (
    received !== expected.sourceReceived ||
    exported !== expected.sourceExported
  ) {
    throw new Error(
      `ROW_ID ${expected.rowId} in ${SOURCE} now reads ` +
        `received ${received} / exported ${exported}, expected ` +
        `${expected.sourceReceived} / ${expected.sourceExported}; the source ` +
        `log has changed, so update KEEP and the total the test asserts.`
    )
  }

  chosen.push({ r, ...expected })
}

if (chosen.length !== KEEP.length) {
  const missing = KEEP.map((k) => k.rowId).filter(
    (id) => !chosen.some((c) => c.rowId === id)
  )
  throw new Error(`ROW_IDs not found in ${SOURCE}: ${missing.join(', ')}`)
}

const keepRows = new Map(chosen.map((c) => [c.r, c]))

const exportedCol = cols.TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED

for (let r = FIRST_DATA_ROW; r <= ws.rowCount; r++) {
  const row = ws.getRow(r)
  const kept = keepRows.get(r)

  if (!kept) {
    // Blank every other load outright - a row with no data columns is skipped
    // by the parser, so it cannot contribute to any total.
    if (typeof at(row, 'TONNAGE_RECEIVED_FOR_EXPORT') === 'number') {
      row.eachCell({ includeEmpty: false }, (cell) => {
        cell.value = null
      })
    }
    continue
  }

  // Rewrite only column T. DATE_OF_EXPORT is deliberately left in place on
  // every kept row, including the blanked ones - that is precisely the shape
  // the old calculation mistook for "already exported".
  if (kept.role === 'blank') {
    row.getCell(exportedCol).value = null
  } else if (kept.role === 'full') {
    row.getCell(exportedCol).value = kept.sourceReceived
  }
}

for (const name of BLANK_SHEETS) {
  const sheet = wb.getWorksheet(name)
  if (!sheet) {
    continue
  }
  for (let r = FIRST_DATA_ROW; r <= sheet.rowCount; r++) {
    sheet.getRow(r).eachCell({ includeEmpty: false }, (cell) => {
      cell.value = null
    })
  }
}

const contribution = (c) => {
  if (c.role === 'blank') {
    return c.sourceReceived
  }
  if (c.role === 'full') {
    return 0
  }
  return round2(c.sourceReceived - c.sourceExported)
}

const expected = round2(chosen.reduce((sum, c) => sum + contribution(c), 0))

// Every kept load is exported inside the period, so the pre-fix calculation
// discards all of them. A fixture the old rule would have got right guards
// nothing.
const underOldRule = 0
if (expected === underOldRule) {
  throw new Error(
    `${OUT}: fixture does not distinguish the old rule from the new one ` +
      `(both give ${expected}); pick different source rows.`
  )
}

await wb.xlsx.writeFile(OUT)

console.log(`\n${OUT}`)
for (const c of chosen) {
  const exportedShown =
    c.role === 'blank'
      ? '(blank)'
      : String(c.role === 'full' ? c.sourceReceived : c.sourceExported)
  console.log(
    `  ROW_ID ${c.rowId}  ${c.role.padEnd(7)}  ` +
      `received ${String(c.sourceReceived).padStart(7)}  ` +
      `exported ${exportedShown.padStart(7)}  ` +
      `-> ${contribution(c)}`
  )
}
console.log(`  old rule (pre-fix)            : ${underOldRule}`)
console.log(`  EXPECTED total not exported   : ${expected}`)
