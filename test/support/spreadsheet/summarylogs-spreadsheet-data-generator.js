import ExcelJS from 'exceljs'
import { fakerEN_GB as faker } from '@faker-js/faker'
import { MATERIALS } from './shared-spreadsheet-values.js'
import {
  PROCESSING_TYPE_CONFIG,
  WORKSHEET_CONFIG
} from './spreadsheet-config.js'
import {
  generateRegNumber as buildRegNumber,
  generateAccNumber as buildAccNumber
} from '../reg-acc-number.js'
import { fileURLToPath } from 'url'
import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import pino from 'pino'

/**
 * A row the caller has planned, rather than one this generator invents.
 *
 * `fields` names cells by the template marker in the worksheet's marker row -
 * EWC_CODE, GROSS_WEIGHT, DATE_RECEIVED_FOR_REPROCESSING - so a plan survives
 * the same field sitting in a different column of each template. A planned
 * field is the last word: it outranks both the random draw and the tonnage
 * the generator derives from it.
 *
 * The problems operators hit in production are plans, not modes:
 *
 * - a blank required field is `{ EWC_CODE: '' }`, giving FIELD_REQUIRED
 * - a bad date is any non-date text in a DATE_ field, giving INVALID_DATE
 * - an amended row is a later upload restating a rowId with a changed field
 * - a removed row is a later upload omitting a rowId it submitted before,
 *   giving SEQUENTIAL_ROW_REMOVED
 *
 * A workbook the service cannot read at all is the one exception, since no
 * row can express it - see the `unreadable` option.
 *
 * @typedef {object} PlannedRow
 * @property {number} [rowId] - the ROW_ID this row carries. Defaults to the
 *   worksheet's own series, as an unplanned workbook numbers its rows.
 * @property {Record<string, string | number>} [fields] - cells to pin, keyed
 *   by template marker.
 * @property {number} [seed] - draws the fields this row leaves unplanned from
 *   this seed rather than at random, so the row renders the same way every
 *   time. An amendment depends on it: the service reads any changed field as
 *   an adjustment, so a row restated in a later upload has to come back
 *   identical but for the field the plan changed. Date fields still move with
 *   the clock under a seed, so a row that must hold still pins its dates too.
 */

/** The worksheet row carrying the template's field markers. */
const MARKER_ROW = 1

/** The first row of a worksheet that holds data rather than headings. */
const FIRST_DATA_ROW = 4

/**
 * Column letters of a worksheet's fields, keyed by their template marker.
 *
 * @param {import('exceljs').Worksheet} sheet
 * @returns {Record<string, string>}
 */
function fieldColumns(sheet) {
  const columns = {}
  sheet.getRow(MARKER_ROW).eachCell((cell, column) => {
    const marker = String(cell.value)
    if (!marker.startsWith('__EPR')) {
      columns[marker] = sheet.getColumn(column).letter
    }
  })
  return columns
}

/**
 * Re-keys a planned row's fields from template markers to column letters.
 *
 * @param {Record<string, string | number>} fields
 * @param {Record<string, string>} columns
 * @param {string} worksheetName
 * @returns {Record<string, string | number>}
 */
function cellsForFields(fields, columns, worksheetName) {
  return Object.fromEntries(
    Object.entries(fields).map(([marker, value]) => {
      const column = columns[marker]
      if (!column) {
        throw new Error(
          `Worksheet '${worksheetName}' has no field marked ${marker}`
        )
      }
      return [column, value]
    })
  )
}

/**
 * Puts a copy of the Cover's first metadata marker into the cell that should
 * hold that marker's value. The parser rejects the whole workbook on a marker
 * in a value position, so nothing in it can be read - the same failure as an
 * operator uploading the wrong template.
 *
 * @param {import('exceljs').Worksheet} coverSheet
 * @returns {void}
 */
function misplaceMetadataMarker(coverSheet) {
  for (let rowNumber = 1; rowNumber <= coverSheet.rowCount; rowNumber++) {
    const row = coverSheet.getRow(rowNumber)
    for (let column = 1; column <= row.cellCount; column++) {
      const marker = String(row.getCell(column).value)
      if (marker.startsWith('__EPR_META_')) {
        row.getCell(column + 1).value = marker
        return
      }
    }
  }
  throw new Error('Cover sheet carries no metadata marker to misplace')
}

function sanitiseFilenameComponent(input) {
  if (typeof input !== 'string') {
    return ''
  }
  return input.replace(/[^a-zA-Z0-9_-]/g, '')
}

// Generate fake registration/accreditation numbers
function generateRegNumber(wasteProcessingType, suffix, nation, orgId) {
  return buildRegNumber({
    wasteProcessingType,
    materialSuffix: suffix,
    nation,
    orgId,
    serial: faker.string.numeric(4)
  })
}

function generateAccNumber(wasteProcessingType, suffix, nation, orgId) {
  return buildAccNumber({
    wasteProcessingType,
    materialSuffix: suffix,
    nation,
    orgId,
    serial: faker.string.numeric(4)
  })
}

/**
 * Renders a summary log workbook, either from rows the caller has planned or
 * from rows this generator invents.
 *
 * @param {object} options
 * @param {string} [options.wasteProcessingType]
 * @param {number} [options.numberOfRows] - rows to invent per worksheet.
 *   Ignored when `rows` is given.
 * @param {string} [options.materialSuffix]
 * @param {string} [options.nation]
 * @param {number|string} [options.orgId]
 * @param {string} [options.accNumber]
 * @param {string} [options.regNumber]
 * @param {number[]|null} [options.sheets] - worksheet indexes to fill.
 * @param {string|null} [options.filename] - a workbook to fill instead of the
 *   processing type's template, letting an upload extend the one before it.
 * @param {number} [options.rowOffset] - rows already filled in `filename`.
 * @param {Record<string, PlannedRow[]>|null} [options.rows] - the rows to
 *   render, keyed by worksheet name. A worksheet the plan omits gets none.
 * @param {boolean} [options.unreadable] - render a workbook the service
 *   rejects wholesale rather than validates.
 * @param {boolean} [options.silentLogging]
 * @returns {Promise<string>} the path the workbook was written to
 */
export async function generateSpreadsheetData(options = {}) {
  const {
    wasteProcessingType,
    numberOfRows = 10,
    materialSuffix = null,
    nation = 'E',
    orgId = faker.number.int({ min: 500000, max: 599999 }),
    accNumber,
    regNumber,
    sheets = null,
    filename = null,
    rowOffset = 0,
    rows = null,
    unreadable = false,
    silentLogging = false
  } = options

  const logger = pino({})

  if (silentLogging) {
    logger.level = 'silent'
  }

  let seededAnyRow = false

  try {
    logger.info('Reading spreadsheet template...')

    // Select material (random or specified)
    let material
    if (materialSuffix) {
      material = MATERIALS.find(
        (m) => m.suffix === materialSuffix.toUpperCase()
      )
      if (!material) {
        throw new Error(
          `Material with suffix '${materialSuffix}' not found. Available: ${MATERIALS.map((m) => m.suffix).join(', ')}`
        )
      }
    } else {
      material = faker.helpers.arrayElement(MATERIALS)
    }

    const registrationNumber =
      regNumber ||
      generateRegNumber(wasteProcessingType, material.suffix, nation, orgId)
    const accreditationNumber =
      accNumber ||
      generateAccNumber(wasteProcessingType, material.suffix, nation, orgId)

    if (!wasteProcessingType || !PROCESSING_TYPE_CONFIG[wasteProcessingType]) {
      throw new Error(`Unknown wasteProcessingType: ${wasteProcessingType}`)
    }
    const config = PROCESSING_TYPE_CONFIG[wasteProcessingType]

    let { templateFile, worksheets } = config

    if (filename !== null) {
      templateFile = filename
    }

    if (rows !== null) {
      const renderable = worksheets
        .filter((_, index) => sheets === null || sheets.includes(index))
        .map((worksheet) => worksheet.name)
      for (const worksheetName of Object.keys(rows)) {
        if (!renderable.includes(worksheetName)) {
          throw new Error(
            `This ${wasteProcessingType} workbook renders no worksheet named '${worksheetName}'`
          )
        }
      }
    }

    // Create workbook and read the template
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(templateFile)

    // Update the Cover sheet only if we are using the default template
    if (filename === null) {
      const coverSheet = workbook.getWorksheet('Cover')
      if (coverSheet) {
        coverSheet.getCell('E7').value = material.dropdownValue
        coverSheet.getCell('E10').value = registrationNumber
        if (!wasteProcessingType.startsWith('regOnly')) {
          coverSheet.getCell('E13').value = accreditationNumber
          logger.info(
            `Updated Cover sheet -- Material: ${material.material}, Registration: ${registrationNumber}, Accreditation: ${accreditationNumber}`
          )
        } else {
          logger.info(
            `Updated Cover sheet -- Material: ${material.material}, Registration: ${registrationNumber}`
          )
        }
      } else {
        logger.warn('Cover sheet not found')
      }
    }

    for (const [index, worksheet] of worksheets.entries()) {
      const sheet = workbook.getWorksheet(worksheet.name)
      if (sheet) {
        if (sheets !== null && !sheets.includes(index)) {
          logger.info(
            `Skipping ${worksheet.name} (sheet ${index} not in SHEETS)`
          )
          continue
        }
        logger.info(`Generating data for ${worksheet.name}...`)

        let currentRow = FIRST_DATA_ROW + rowOffset

        let targetCols = ['B']
        if (
          worksheet.name === 'Received (sections 1, 2 and 3)' ||
          worksheet.name === 'Received (sections 1 and 2)' ||
          worksheet.name === 'Exported (sections 1, 2 and 3)'
        ) {
          targetCols = ['B', 'N', 'S']
        } else if (worksheet.name === 'Reprocessed (sections 3 and 4)') {
          targetCols = ['B', 'J']
        } else if (worksheet.name === 'Received (section 1)') {
          targetCols = ['B', 'G', 'K', 'Q']
        }
        workbook.eachSheet((sheet) => {
          sheet.eachRow((row) => {
            targetCols.forEach((col) => {
              const cell = row.getCell(col)
              if (cell.type === ExcelJS.ValueType.Formula) {
                cell.value = cell.result ?? null
              }
            })
          })
        })

        const worksheetConfig =
          WORKSHEET_CONFIG[wasteProcessingType][worksheet.name]
        /** @type {PlannedRow[]} */
        const plannedRows =
          rows === null
            ? Array.from({ length: numberOfRows }, () => ({}))
            : (rows[worksheet.name] ?? [])
        const columns = fieldColumns(sheet)

        for (const [i, plannedRow] of plannedRows.entries()) {
          if (plannedRow.seed !== undefined) {
            faker.seed(plannedRow.seed)
            seededAnyRow = true
          }
          const rowData = worksheet.fn(material)
          const plannedCells = cellsForFields(
            plannedRow.fields ?? {},
            columns,
            worksheet.name
          )
          Object.assign(rowData, plannedCells)

          rowData.B = `${plannedRow.rowId ?? worksheetConfig.rowId + rowOffset + i}`
          worksheetConfig.tonnage?.(rowData, plannedCells)

          // Insert data only into specified columns
          Object.entries(rowData).forEach(([columnLetter, value]) => {
            const cell = sheet.getCell(`${columnLetter}${currentRow}`)
            cell.value = value
            const dateRegex = /^\d{2}\/\d{2}\/\d{4}$/
            if (typeof value === 'string' && dateRegex.test(value)) {
              const [day, month, year] = value.split('/').map(Number)
              cell.value = new Date(year, month - 1, day, 12, 0, 0)
              cell.numFmt = 'dd/mm/yyyy'
            }
          })

          currentRow++
        }

        logger.info(
          `Generated ${plannedRows.length} rows for ${worksheet.name} (rows ${FIRST_DATA_ROW + rowOffset}-${currentRow - 1})`
        )
      }
    }

    if (unreadable) {
      const coverSheet = workbook.getWorksheet('Cover')
      if (!coverSheet) {
        throw new Error('Cover sheet not found')
      }
      misplaceMetadataMarker(coverSheet)
      logger.info(
        'Misplaced a Cover metadata marker: this workbook is unreadable'
      )
    }

    const safeType = sanitiseFilenameComponent(wasteProcessingType)
    const safeAcc = sanitiseFilenameComponent(accreditationNumber)
    const safeReg = sanitiseFilenameComponent(registrationNumber)

    const sheetsSuffix = sheets !== null ? `_sheets${sheets.join('-')}` : ''

    let outputFile
    if (!wasteProcessingType.startsWith('regOnly')) {
      outputFile = `data/${safeType}_${safeAcc}_${safeReg}${sheetsSuffix}.xlsx`
    } else {
      outputFile = `data/${safeType}_${safeReg}${sheetsSuffix}.xlsx`
    }
    // data/ is gitignored, so it is absent in a fresh clone or worktree.
    await mkdir(dirname(outputFile), { recursive: true })
    await workbook.xlsx.writeFile(outputFile)

    logger.info(`Successfully generated spreadsheet: ${outputFile}`)

    return outputFile
  } catch (error) {
    logger.error('Error generating spreadsheet:', error.message)
    logger.error(error.stack)
    throw error
  } finally {
    // Leaving faker on a plan's seed would make every later draw in this
    // process follow from it, including other callers' rows.
    if (seededAnyRow) {
      faker.seed()
    }
  }
}

// Parse command line arguments
const args = process.argv.slice(2)
const options = {}

if (process.env.MATERIAL) {
  options.materialSuffix = process.env.MATERIAL
}

if (process.env.ROWS) {
  options.numberOfRows = parseInt(process.env.ROWS, 10)
}

if (process.env.ACC_NUMBER) {
  options.accNumber = process.env.ACC_NUMBER
}

if (process.env.REG_NUMBER) {
  options.regNumber = process.env.REG_NUMBER
}

if (process.env.SHEETS) {
  options.sheets = process.env.SHEETS.split(',').map(Number)
}

if (process.env.FILENAME) {
  options.filename = process.env.FILENAME
}

if (process.env.ROW_OFFSET) {
  options.rowOffset = parseInt(process.env.ROW_OFFSET, 10)
}
args.forEach((arg) => {
  if (arg.startsWith('--material=')) {
    options.materialSuffix = arg.split('=')[1]
  } else if (arg.startsWith('--rows=')) {
    options.numberOfRows = parseInt(arg.split('=')[1], 10)
  } else if (arg.startsWith('--wasteProcessingType=')) {
    options.wasteProcessingType = arg.split('=')[1]
  } else if (arg.startsWith('--accNumber=')) {
    options.accNumber = arg.split('=')[1]
  } else if (arg.startsWith('--regNumber=')) {
    options.regNumber = arg.split('=')[1]
  } else if (arg.startsWith('--orgId=')) {
    options.orgId = arg.split('=')[1]
  } else if (arg.startsWith('--nation=')) {
    options.nation = arg.split('=')[1]
  } else if (arg.startsWith('--sheets=')) {
    options.sheets = arg.split('=')[1].split(',').map(Number)
  } else if (arg.startsWith('--filename=')) {
    options.filename = arg.split('=')[1]
  } else if (arg.startsWith('--rowOffset=')) {
    options.rowOffset = parseInt(arg.split('=')[1], 10)
  }
})

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  generateSpreadsheetData(options).catch(() => process.exit(1))
}
