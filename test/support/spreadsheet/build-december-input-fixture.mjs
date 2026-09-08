// Builds the December variant of the reprocessor-input summary-log fixture used
// by the December-waste-balance journey test. It takes the existing
// resources/summary-log.xlsx (whose received loads are dated in a non-December
// month) and rewrites every received-load date into December of the
// accreditation year, leaving all tonnage untouched so the cached formula
// results stay valid.
//
// The two files are submitted in sequence by the test: the March file first, so
// its ledger event carries no December portion (the events page shows a dash),
// then this December file, whose submission restates the balance into December
// (the events page shows the amount). Run with:
//   node test/support/spreadsheet/build-december-input-fixture.mjs

import ExcelJS from 'exceljs'

const SOURCE = 'resources/summary-log.xlsx'
const OUTPUT = 'resources/summary-log-december.xlsx'

// December of the accreditation year the seeding grants (validFrom 2026-01-01).
const DECEMBER_DATE = '2026-12-15T00:00:00.000Z'

// Column G on the received sheet is DATE_RECEIVED_FOR_REPROCESSING; column K is
// GROSS_WEIGHT, present only on real load rows. Row 3 is the template's own
// "Example" row and is left untouched.
const DATE_COLUMN = 'G'
const GROSS_WEIGHT_COLUMN = 'K'
const EXAMPLE_MARKER_COLUMN = 'F'

const workbook = new ExcelJS.Workbook()
await workbook.xlsx.readFile(SOURCE)

const received = workbook.worksheets.find((sheet) =>
  /^Received/.test(sheet.name)
)
if (!received) {
  throw new Error('Received sheet not found')
}

const changed = []
received.eachRow((row, rowNumber) => {
  const grossWeight = row.getCell(GROSS_WEIGHT_COLUMN).value
  const isExample = row.getCell(EXAMPLE_MARKER_COLUMN).value === 'Example'
  if (typeof grossWeight === 'number' && !isExample) {
    row.getCell(DATE_COLUMN).value = DECEMBER_DATE
    changed.push(rowNumber)
  }
})

await workbook.xlsx.writeFile(OUTPUT)
process.stdout.write(
  `Wrote ${OUTPUT}; redated received rows ${changed.join(', ')} to ${DECEMBER_DATE}\n`
)
