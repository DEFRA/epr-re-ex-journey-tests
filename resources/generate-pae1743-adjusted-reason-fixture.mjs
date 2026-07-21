/*
 * Generates the PAE-1743 "adjusted reduced-load reason" fixture by deriving it
 * from an existing (already-valid) summary log.
 *
 * PAE-1743: on the enhanced check page, an adjusted load excluded from the waste
 * balance for a reason OTHER than missing data (here, a PRN having been issued)
 * must show that reason under the "This load has reduced your waste balance"
 * heading — not be filed under a "missing required summary log data" heading with
 * the reason hidden.
 *
 * The fixture is the SECOND upload in an open-period adjustment: a baseline log
 * is uploaded first, then this re-upload changes exactly one cell on one row so
 * that a previously-included load becomes excluded. The load keeps all its
 * required data, so the backend zeroes its contribution and its adjusted leg is
 * negative — landing it in the balance-affecting "reduced" sub-group.
 *
 * Why derive rather than hand-author: the tonnage columns are cross-field
 * validated against a formula, so a row's numbers must stay internally
 * consistent. Deriving from a real fixture and touching a single non-tonnage
 * cell keeps every other row byte-for-byte valid and makes the change reviewable.
 *
 * Run: node resources/generate-pae1743-adjusted-reason-fixture.mjs
 * ExcelJS is resolved from the epr-backend workspace (not a dep of this repo).
 *
 * Consumed by: summarylogs.enhanced.check.cma.e2e.js (@adjustedReducedReason).
 */
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const require = createRequire(import.meta.url)
const here = path.dirname(fileURLToPath(import.meta.url))
const ExcelJS = require(
  path.join(here, '../../epr-backend/node_modules/exceljs/lib/exceljs.nodejs.js')
)

const HEADER_ROW = 1
const FIRST_DATA_ROW = 4 // row 3 is the "Example" row
const TARGET_ROW_ID = 1001 // the row each fixture excludes on re-upload

/** Read the cell value, unwrapping ExcelJS formula results. */
const cellValue = (cell) => {
  const v = cell.value
  if (v && typeof v === 'object' && 'result' in v) {return v.result}
  return v
}

/** Map machine header keys (row 1) to column numbers. */
const headerMap = (ws) => {
  const map = {}
  ws.getRow(HEADER_ROW).eachCell((cell, col) => {
    if (typeof cell.value === 'string') {map[cell.value] = col}
  })
  return map
}

/**
 * Copies `source` to `out`, changing exactly one cell — `field` on the row whose
 * ROW_ID is TARGET_ROW_ID — from `expectedBefore` to `after`. Throws unless
 * exactly one row is changed and it held the expected value, so a fixture can
 * never silently drift from the one-cell-diff invariant the tests rely on.
 */
async function deriveOneCell({ source, out, dataSheet, field, expectedBefore, after }) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(path.join(here, source))
  const ws = wb.getWorksheet(dataSheet)
  if (!ws) {throw new Error(`${source}: sheet "${dataSheet}" not found`)}

  const cols = headerMap(ws)
  if (!cols.ROW_ID || !cols[field]) {
    throw new Error(`${source}: missing ROW_ID or ${field} column`)
  }

  let changed = 0
  for (let r = FIRST_DATA_ROW; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    if (cellValue(row.getCell(cols.ROW_ID)) !== TARGET_ROW_ID) {continue}
    const cell = row.getCell(cols[field])
    const before = cellValue(cell)
    if (before !== expectedBefore) {
      throw new Error(
        `${source} row ${r}: expected ${field}=${JSON.stringify(expectedBefore)}, got ${JSON.stringify(before)}`
      )
    }
    cell.value = after
    changed++
  }

  if (changed !== 1) {
    throw new Error(`${source}: expected to change exactly 1 row, changed ${changed}`)
  }

  await wb.xlsx.writeFile(path.join(here, out))
  console.log(`${out}: row ${TARGET_ROW_ID} ${field} ${JSON.stringify(expectedBefore)} -> ${JSON.stringify(after)}`)
}

// PRN (reprocessor input): a PRN was issued on re-upload, rendering the exact
// string the ticket quotes ("A PRN was already issued for this load").
await deriveOneCell({
  source: 'summary-log.xlsx',
  out: 'reprocessor-input-prn-issued.xlsx',
  dataSheet: 'Received (sections 1, 2 and 3)',
  field: 'WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE',
  expectedBefore: 'No',
  after: 'Yes'
})
