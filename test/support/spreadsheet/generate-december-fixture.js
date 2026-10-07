import ExcelJS from 'exceljs'
import { generateSpreadsheetData } from './summarylogs-spreadsheet-data-generator.js'

// The December-accruing column per processing type, matching epr-backend's
// contributionFor (credited-tonnage.js): the exporter's EXPORTER_RECEIVED_FIELDS
// .DATE_RECEIVED_BY_OSR and the reprocessor-input's
// RECEIVED_LOADS_FOR_REPROCESSING_FIELDS.DATE_RECEIVED_FOR_REPROCESSING.
const DECEMBER_DATE_COLUMN = {
  exporter: 'Y',
  reprocessorInput: 'G'
}

const WORKSHEET_NAME = {
  exporter: 'Exported (sections 1, 2 and 3)',
  reprocessorInput: 'Received (sections 1, 2 and 3)'
}

// reprocessorInput's sent-on rows deduct only from the general balance, never
// from the December portion (epr-backend's DECEMBER_ACCRUING_RECORD_TYPES,
// december-credit-total.js, PAE-1920). If they outweigh the non-December
// received rows' net tonnage, the derived non-December available balance
// (availableAmount - decemberAvailableAmount) goes negative. Capping sent-on
// to a safe fraction of the non-December received net keeps every
// regeneration of this fixture valid regardless of the random draw.
const SENT_ON_WORKSHEET_NAME = 'Sent on (sections 5, 6 and 7)'
const SENT_ON_TONNAGE_COLUMN = 'H'
const RECEIVED_EXCLUSION_COLUMN = 'J' // WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE
const RECEIVED_NET_TONNAGE_COLUMN = 'S'
const MAX_SENT_ON_FRACTION_OF_NON_DECEMBER_RECEIVED = 0.5

/**
 * Cap reprocessorInput's sent-on tonnage so it cannot exceed the non-December
 * received rows' net tonnage - see SENT_ON_WORKSHEET_NAME above.
 *
 * @param {import('exceljs').Workbook} workbook
 * @param {number} firstRow
 * @param {number} decemberRows
 * @param {number} nonDecemberRows
 * @returns {void}
 */
function capSentOnTonnage(workbook, firstRow, decemberRows, nonDecemberRows) {
  const receivedSheet = workbook.getWorksheet(WORKSHEET_NAME.reprocessorInput)
  if (!receivedSheet) {
    throw new Error(`Worksheet "${WORKSHEET_NAME.reprocessorInput}" not found`)
  }

  let nonDecemberReceivedNet = 0
  for (let i = 0; i < nonDecemberRows; i++) {
    const row = firstRow + decemberRows + i
    if (
      receivedSheet.getCell(`${RECEIVED_EXCLUSION_COLUMN}${row}`).value ===
      'Yes'
    ) {
      continue
    }
    nonDecemberReceivedNet += Number(
      receivedSheet.getCell(`${RECEIVED_NET_TONNAGE_COLUMN}${row}`).value
    )
  }

  const sentOnSheet = workbook.getWorksheet(SENT_ON_WORKSHEET_NAME)
  if (!sentOnSheet) {
    throw new Error(`Worksheet "${SENT_ON_WORKSHEET_NAME}" not found`)
  }

  const sentOnRowCount = decemberRows + nonDecemberRows
  const cap =
    (nonDecemberReceivedNet * MAX_SENT_ON_FRACTION_OF_NON_DECEMBER_RECEIVED) /
    sentOnRowCount

  for (let i = 0; i < sentOnRowCount; i++) {
    const row = firstRow + i
    const cell = sentOnSheet.getCell(`${SENT_ON_TONNAGE_COLUMN}${row}`)
    if (Number(cell.value) > cap) {
      cell.value = parseFloat(cap.toFixed(2))
    }
  }
}

// generateExportedRow randomises these Yes/No; classifyForWasteBalance
// (received-loads-for-export.js) excludes the row from the waste balance
// whenever any one of them lands on 'Yes', so every row pins them to 'No' or
// either pool can silently accrue zero.
const NO_EXCLUSION_COLUMNS = {
  exporter: {
    J: 'No', // WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE
    AN: 'No', // WAS_THE_WASTE_REFUSED
    AO: 'No' // WAS_THE_WASTE_STOPPED
  },
  reprocessorInput: {
    J: 'No' // WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE
  }
}

const DECEMBER_ROWS = 4
const NON_DECEMBER_ROWS = 4
const FIRST_ROW = 4

/**
 * Generates a summary-log fixture with a December-accruing pool distinct from
 * its non-December pool, so a journey test can assert a raise draws from only
 * the pool it selects. Generates the usual randomised rows via
 * generateSpreadsheetData, then overwrites the December-critical date column
 * on the first DECEMBER_ROWS rows to a fixed December date of the
 * accreditation year, and on the rest to a fixed January date of it. A random
 * recent date would land in December whenever the run does.
 *
 * @param {Parameters<typeof generateSpreadsheetData>[0] & { wasteProcessingType: 'exporter' | 'reprocessorInput' }} options - forwarded to generateSpreadsheetData
 * @param {number} accreditationYear - the year whose December the fixture's
 *   December-dated rows must fall in (the accreditation's validFrom year)
 * @returns {Promise<string>} the generated file path
 */
export async function generateDecemberFixture(options, accreditationYear) {
  const filename = await generateSpreadsheetData({
    ...options,
    numberOfRows: DECEMBER_ROWS + NON_DECEMBER_ROWS
  })

  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(filename)

  const sheet = workbook.getWorksheet(
    WORKSHEET_NAME[options.wasteProcessingType]
  )
  if (!sheet) {
    throw new Error(
      `Worksheet "${WORKSHEET_NAME[options.wasteProcessingType]}" not found in ${filename}`
    )
  }
  const column = DECEMBER_DATE_COLUMN[options.wasteProcessingType]

  const noExclusionColumns = NO_EXCLUSION_COLUMNS[options.wasteProcessingType]

  for (let i = 0; i < DECEMBER_ROWS + NON_DECEMBER_ROWS; i++) {
    const month = i < DECEMBER_ROWS ? 11 : 0
    const cell = sheet.getCell(`${column}${FIRST_ROW + i}`)
    cell.value = new Date(accreditationYear, month, 15, 12, 0, 0)
    cell.numFmt = 'dd/mm/yyyy'
  }

  for (let i = 0; i < DECEMBER_ROWS + NON_DECEMBER_ROWS; i++) {
    for (const [exclusionColumn, value] of Object.entries(noExclusionColumns)) {
      sheet.getCell(`${exclusionColumn}${FIRST_ROW + i}`).value = value
    }
  }

  if (options.wasteProcessingType === 'reprocessorInput') {
    capSentOnTonnage(workbook, FIRST_ROW, DECEMBER_ROWS, NON_DECEMBER_ROWS)
  }

  await workbook.xlsx.writeFile(filename)

  return filename
}
