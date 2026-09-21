import ExcelJS from 'exceljs'
import {
  PROCESSING_TYPE_CONFIG,
  WORKSHEET_CONFIG
} from './spreadsheet-config.js'
import {
  fieldColumns,
  fillRows,
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
