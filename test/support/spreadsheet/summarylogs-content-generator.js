import ExcelJS from 'exceljs'
import {
  PROCESSING_TYPE_CONFIG,
  WORKSHEET_CONFIG
} from './spreadsheet-config.js'
import {
  fieldColumns,
  fillRows,
  FIRST_DATA_ROW,
  MARKER_ROW,
  materialWithSuffix,
  ukDateParts
} from './summarylogs-spreadsheet-data-generator.js'

/** @import {PlannedRow} from './summarylogs-spreadsheet-data-generator.js' */

/** The marker a worksheet's data table opens with, followed by the table's name. */
const DATA_MARKER = '__EPR_DATA_'

/**
 * @typedef {string | number | null} Cell
 * @typedef {{headers: string[], rows: Cell[][]}} TableContent
 * @typedef {{meta: Record<string, string>, data: Record<string, TableContent>}} SummaryLogContent
 */

/**
 * @typedef {Object} WorksheetLayout
 * @property {string} table - the name the service reads the worksheet's rows under
 * @property {Record<string, string>} columns - column letters by template marker, in column order
 */

/** @type {Map<string, Promise<Map<string, WorksheetLayout>>>} by template file */
const layouts = new Map()

/**
 * Where each worksheet's fields sit, read off the template once for the
 * process, since the template is what makes reading it cost seconds.
 *
 * @param {string} templateFile
 * @returns {Promise<Map<string, WorksheetLayout>>} by worksheet name
 */
function templateLayout(templateFile) {
  let layout = layouts.get(templateFile)
  if (!layout) {
    layout = readLayout(templateFile)
    layouts.set(templateFile, layout)
  }
  return layout
}

/**
 * @param {string} templateFile
 * @returns {Promise<Map<string, WorksheetLayout>>}
 */
async function readLayout(templateFile) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(templateFile)
  /** @type {Map<string, WorksheetLayout>} */
  const layout = new Map()
  workbook.eachSheet((sheet) => {
    const table = tableOf(sheet)
    if (table) {
      layout.set(sheet.name, { table, columns: fieldColumns(sheet) })
    }
  })
  return layout
}

/**
 * @param {import('exceljs').Worksheet} sheet
 * @returns {string | null}
 */
function tableOf(sheet) {
  /** @type {string | null} */
  let table = null
  sheet.getRow(MARKER_ROW).eachCell((cell) => {
    const marker = String(cell.value)
    if (marker.startsWith(DATA_MARKER)) {
      table = marker.slice(DATA_MARKER.length)
    }
  })
  return table
}

/** @param {number} part */
const pad = (part) => String(part).padStart(2, '0')

/**
 * A cell as the service reads it off a sheet: a date as its calendar date, a
 * cell holding nothing as null. Other text stays as it is, so a bad date is
 * sent as the text it was planted as.
 *
 * @param {string | number | undefined} value
 * @returns {Cell}
 */
function parsedValue(value) {
  if (value === undefined || value === '') {
    return null
  }
  const date = ukDateParts(value)
  return date ? `${date.year}-${pad(date.month)}-${pad(date.day)}` : value
}

/**
 * The content of a summary log as the service takes it in one request: the
 * cover's metadata and, for each worksheet the plan gives rows, the table it
 * is read as, with the rows the workbook would have carried. The same rows
 * under the same seeds come out the same either way, so a row restated here
 * restates what an earlier workbook carried.
 *
 * @param {object} options
 * @param {string} options.wasteProcessingType
 * @param {string} options.materialSuffix
 * @param {string} options.regNumber
 * @param {string} [options.accNumber] - absent for a registered-only template
 * @param {Record<string, PlannedRow[]>} options.rows - by worksheet name; a worksheet given none is left out
 * @returns {Promise<SummaryLogContent>}
 */
export async function generateSummaryLogContent({
  wasteProcessingType,
  materialSuffix,
  regNumber,
  accNumber,
  rows
}) {
  const config = PROCESSING_TYPE_CONFIG[wasteProcessingType]
  if (!config) {
    throw new Error(`Unknown wasteProcessingType: ${wasteProcessingType}`)
  }
  const material = materialWithSuffix(materialSuffix)
  const layout = await templateLayout(config.templateFile)

  /** @type {Record<string, TableContent>} */
  const data = {}
  for (const [worksheetName, plannedRows] of Object.entries(rows)) {
    const worksheet = config.worksheets.find(
      (one) => one.name === worksheetName
    )
    const worksheetLayout = layout.get(worksheetName)
    if (!worksheet || !worksheetLayout) {
      throw new Error(
        `This ${wasteProcessingType} template carries no worksheet named '${worksheetName}'`
      )
    }
    if (plannedRows.length === 0) {
      continue
    }
    const { table, columns } = worksheetLayout
    const headers = Object.keys(columns)
    const filled = fillRows(plannedRows, {
      worksheet,
      worksheetConfig: WORKSHEET_CONFIG[wasteProcessingType][worksheetName],
      columns,
      material
    })
    data[table] = {
      headers,
      rows: filled.map((row) =>
        headers.map((header) => parsedValue(row[columns[header]]))
      )
    }
  }

  return {
    meta: {
      MATERIAL: material.dropdownValue,
      REGISTRATION_NUMBER: regNumber,
      ...(accNumber ? { ACCREDITATION_NUMBER: accNumber } : {})
    },
    data
  }
}

/**
 * The content of a summary log exactly as an already-filled workbook holds
 * it: the cover's metadata, and for each worksheet carrying a data table,
 * every row already present - wherever it sits in the sheet, the same way
 * the service's own upload parser reads a real file, skipping only the rows
 * a fixture leaves blank. Lets a checked-in xlsx fixture's real values be
 * replayed through the dev endpoint instead of uploading the file itself.
 *
 * @param {string} fixturePath
 * @returns {Promise<SummaryLogContent>}
 */
export async function summaryLogContentFromFixture(fixturePath) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(fixturePath)

  const coverSheet = workbook.getWorksheet('Cover')
  if (!coverSheet) {
    throw new Error(`${fixturePath} carries no Cover sheet`)
  }
  const accreditationNumber = coverSheet.getCell('E13').value
  const meta = {
    MATERIAL: String(coverSheet.getCell('E7').value),
    REGISTRATION_NUMBER: String(coverSheet.getCell('E10').value),
    ...(accreditationNumber
      ? { ACCREDITATION_NUMBER: String(accreditationNumber) }
      : {})
  }

  /** @type {Record<string, TableContent>} */
  const data = {}
  workbook.eachSheet((sheet) => {
    const table = tableOf(sheet)
    if (!table) {
      return
    }
    const columns = fieldColumns(sheet)
    const headers = Object.keys(columns)
    const rows = filledRowsOf(sheet, headers, columns)
    if (rows.length > 0) {
      data[table] = { headers, rows }
    }
  })

  return { meta, data }
}

/**
 * Every row of a worksheet's data table that carries a ROW_ID, from the
 * first data row to the sheet's last - wherever it sits, since a fixture
 * built to isolate a few loads (see
 * resources/generate-reconciliation-fixtures.mjs) blanks the rows around the
 * kept ones rather than only the rows after them. ROW_ID is the template's
 * own signal for "this row carries data" (its formula is COUNTA over the
 * row's fields), which every worksheet fills via `rowData.B` - it survives
 * where a blanket "any field is non-empty" check would not, since an
 * unfilled row's dropdown cells still carry their template placeholder text
 * ("Choose option") as a genuine, non-empty cell value.
 *
 * @param {import('exceljs').Worksheet} sheet
 * @param {string[]} headers
 * @param {Record<string, string>} columns
 * @returns {Cell[][]}
 */
function filledRowsOf(sheet, headers, columns) {
  const rowIdColumn = columns.ROW_ID
  const rows = []
  for (
    let rowNumber = FIRST_DATA_ROW;
    rowNumber <= sheet.rowCount;
    rowNumber++
  ) {
    const row = sheet.getRow(rowNumber)
    if (fixtureCellValue(row.getCell(rowIdColumn).value) === null) {
      continue
    }
    rows.push(
      headers.map((header) =>
        fixtureCellValue(row.getCell(columns[header]).value)
      )
    )
  }
  return rows
}

/**
 * A cell as an already-filled fixture holds it: a formula's cached result
 * rather than its expression, a date cell as the calendar date the dev
 * endpoint expects, and a cell holding nothing as null.
 *
 * @param {import('exceljs').CellValue} value
 * @returns {Cell}
 */
function fixtureCellValue(value) {
  // A formula cell the workbook never recalculated carries no 'result' at
  // all (only its expression), which reads the same as one COUNTA finds
  // nothing under - both are unfilled, not a value to send on.
  const resolved =
    value && typeof value === 'object' && !(value instanceof Date)
      ? /** @type {{ result?: unknown }} */ (value).result
      : value
  if (resolved === undefined || resolved === null || resolved === '') {
    return null
  }
  if (resolved instanceof Date) {
    return `${resolved.getUTCFullYear()}-${pad(resolved.getUTCMonth() + 1)}-${pad(resolved.getUTCDate())}`
  }
  return typeof resolved === 'number' ? resolved : String(resolved)
}
