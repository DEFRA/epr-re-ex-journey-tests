/*
 * Generates the exporter reconciliation fixture by deriving it from the
 * existing (already-valid) sanity summary log.
 *
 * Why derive rather than hand-author: the exported tonnages are
 * cross-field validated against a formula (net weight x recyclable proportion,
 * etc. -- see epr-backend validateTonnageExport), so a row's numbers must be
 * internally consistent. Real sanity rows already satisfy that and naturally
 * carry >2dp tonnages, which is exactly what exposes the sum-then-round drift.
 *
 * Strategy: keep only a few "clean" loads (not through an interim site, not
 * refused, not stopped, no PRN/PERN already issued, one approved overseas site)
 * and blank every other load, so the period total is the sum of a handful of
 * known >2dp rows. Blanked rows have no data columns, so the parser skips them.
 *
 * Run from the repo root: node resources/generate-reconciliation-fixtures.js
 *
 * Writes resources/exporter-reconciliation.xlsx and prints its
 * round-each-then-sum total - the value the tests assert. It refuses to emit a fixture where round-each-then-sum and
 * sum-then-round agree (that would guard nothing). If the printed totals
 * change, update the expected values in report.reconciliation.exporter.e2e.js
 * and summarylogs-content-generator.test.js.
 */
import ExcelJS from 'exceljs'

const KEEP = 4 // number of clean loads to retain
const HEADER_ROW = 1 // machine-key header row
const FIRST_DATA_ROW = 4 // row 3 is the "Example" row

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

/**
 * @param {object} opts
 * @param {string} opts.source - source xlsx path
 * @param {string} opts.out - output xlsx path
 * @param {string} opts.dataSheet - sheet holding the loads
 * @param {string} opts.tonnageKey - machine key of the tonnage summed by the report
 * @param {string[]} opts.blankSheets - other data sheets to blank entirely
 */
async function generate({ source, out, dataSheet, tonnageKey, blankSheets }) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(source)
  const ws = wb.getWorksheet(dataSheet)
  const cols = headerMap(ws)

  const tonCol = cols[tonnageKey]
  const interimCol = cols.DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE
  const refusedCol = cols.WAS_THE_WASTE_REFUSED
  const stoppedCol = cols.WAS_THE_WASTE_STOPPED
  const prnCol = cols.WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE
  const osrCol = cols.OSR_ID

  const at = (row, col) => (col ? cellValue(row.getCell(col)) : undefined)

  const candidates = []
  for (let r = FIRST_DATA_ROW; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const tonnage = at(row, tonCol)
    // blank / non-load row
    if (typeof tonnage !== 'number') {
      continue
    }
    const clean =
      isNo(at(row, interimCol)) &&
      isNo(at(row, refusedCol)) &&
      isNo(at(row, stoppedCol)) &&
      isNo(at(row, prnCol)) &&
      // one approved overseas site (100) so ORS approval is uniform, if present
      (!osrCol || String(at(row, osrCol)) === '100')
    if (clean) {
      candidates.push({ r, tonnage })
    }
  }

  // Pick KEEP rows whose round-each-then-sum differs from sum-then-round, so the
  // fixture actually distinguishes the two aggregation orders.
  let chosen = candidates.slice(0, KEEP)
  for (let start = 0; start + KEEP <= candidates.length; start++) {
    const slice = candidates.slice(start, start + KEEP)
    const roundThenSum = round2(
      slice.reduce((s, c) => s + round2(c.tonnage), 0)
    )
    const sumThenRound = round2(slice.reduce((s, c) => s + c.tonnage, 0))
    if (roundThenSum !== sumThenRound) {
      chosen = slice
      break
    }
  }
  const keepRows = new Set(chosen.map((c) => c.r))

  for (let r = FIRST_DATA_ROW; r <= ws.rowCount; r++) {
    if (keepRows.has(r)) {
      continue
    }
    const row = ws.getRow(r)
    if (typeof at(row, tonCol) !== 'number') {
      continue
    }
    row.eachCell({ includeEmpty: false }, (cell) => {
      cell.value = null
    })
  }

  // Blank other data sheets (sent-on, reprocessed) so they add nothing.
  for (const name of blankSheets) {
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

  const tonnages = chosen.map((c) => c.tonnage)
  const reconciled = round2(tonnages.reduce((s, t) => s + round2(t), 0))
  const buggy = round2(tonnages.reduce((s, t) => s + t, 0))

  // Refuse to write a fixture that doesn't expose the sum-then-round drift -- it
  // would guard nothing, since round-each-then-sum and sum-then-round must
  // diverge for the reconciliation tests to distinguish the bug from the fix.
  if (reconciled === buggy) {
    throw new Error(
      `${out}: fixture does not expose the sum-then-round drift ` +
        `(round-each-then-sum ${reconciled} === sum-then-round ${buggy}); ` +
        `pick different source rows.`
    )
  }

  await wb.xlsx.writeFile(out)

  console.log(`\n${out}`)
  console.log('  kept rows:', chosen.map((c) => c.r).join(', '))
  console.log('  tonnages :', tonnages.join(', '))
  console.log('  round-each-then-sum (EXPECTED):', reconciled)
  console.log('  sum-then-round (buggy)        :', buggy)
  console.log('  drift                          :', round2(reconciled - buggy))
}

await generate({
  source: 'resources/sanity/exporter_A26EX5000000002PA_R26EX5000000002PA.xlsx',
  out: 'resources/exporter-reconciliation.xlsx',
  dataSheet: 'Exported (sections 1, 2 and 3)',
  tonnageKey: 'TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED',
  blankSheets: ['Sent on (sections 4 and 5)']
})
