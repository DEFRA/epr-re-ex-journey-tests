import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import { generateSpreadsheetData } from './summarylogs-spreadsheet-data-generator.js'

const RECEIVED = 'Received (sections 1, 2 and 3)'
const FIRST_DATA_ROW = 4

const baseOptions = {
  wasteProcessingType: 'reprocessorInput',
  materialSuffix: 'PA',
  sheets: [0],
  silentLogging: true
}

/** The named worksheet of a workbook rendered with these options. */
async function renderSheet(options, worksheetName = RECEIVED) {
  const workbook = await render(options)
  const sheet = workbook.getWorksheet(worksheetName)
  assert.ok(sheet, `no worksheet named ${worksheetName}`)
  return sheet
}

async function render(options) {
  const file = await generateSpreadsheetData({ ...baseOptions, ...options })
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(file)
  return workbook
}

/** The value a cell holds, unwrapping ExcelJS's formula objects. */
function valueOf(cell) {
  const value = cell.value
  if (value && typeof value === 'object' && 'result' in value) {
    return value.result
  }
  return value
}

/** Column letter of the field carrying `marker` in the sheet's marker row. */
function columnOf(sheet, marker) {
  let letter = null
  sheet.getRow(1).eachCell((cell, column) => {
    if (String(cell.value) === marker) {
      letter = sheet.getColumn(column).letter
    }
  })
  assert.ok(letter, `no column marked ${marker}`)
  return letter
}

function field(sheet, marker, row) {
  return valueOf(sheet.getCell(`${columnOf(sheet, marker)}${row}`))
}

/** Every filled cell of the sheet's data rows, as `<address>=<value>`. */
function cellsOf(sheet) {
  const cells = []
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber < FIRST_DATA_ROW) {
      return
    }
    row.eachCell((cell) => {
      cells.push(`${cell.address}=${JSON.stringify(valueOf(cell))}`)
    })
  })
  return cells
}

function rowIds(sheet, count) {
  return Array.from({ length: count }, (_, i) =>
    valueOf(sheet.getCell(`B${FIRST_DATA_ROW + i}`))
  )
}

describe('summary log spreadsheet generator', () => {
  describe('given a row list', () => {
    let sheet

    before(async () => {
      sheet = await renderSheet({
        rows: {
          [RECEIVED]: [
            {
              rowId: 1000,
              fields: { GROSS_WEIGHT: 200, TARE_WEIGHT: 20, PALLET_WEIGHT: 10 }
            },
            { rowId: 1001 },
            { rowId: 1002, fields: { EWC_CODE: '' } },
            {
              rowId: 1003,
              fields: { DATE_RECEIVED_FOR_REPROCESSING: 'not a date' }
            },
            { rowId: 1004, fields: { NET_WEIGHT: 12.5 } }
          ]
        }
      })
    })

    it('renders exactly the planned rows, in order, from the first data row', () => {
      assert.deepEqual(rowIds(sheet, 6), [
        '1000',
        '1001',
        '1002',
        '1003',
        '1004',
        null
      ])
    })

    it('pins a field named by its template marker', () => {
      assert.equal(field(sheet, 'GROSS_WEIGHT', 4), 200)
      assert.equal(field(sheet, 'TARE_WEIGHT', 4), 20)
      assert.equal(field(sheet, 'PALLET_WEIGHT', 4), 10)
    })

    it('derives net weight from the pinned weights', () => {
      assert.equal(field(sheet, 'NET_WEIGHT', 4), 170)
    })

    it('fills the fields a row leaves unplanned', () => {
      assert.ok(field(sheet, 'EWC_CODE', 5))
      assert.ok(field(sheet, 'GROSS_WEIGHT', 5) > 0)
    })

    it('blanks a required field, for FIELD_REQUIRED', () => {
      // The parser counts an empty string as an empty cell, alongside a cell
      // holding nothing at all (its isCellEmpty).
      assert.equal(field(sheet, 'EWC_CODE', 6), '')
    })

    it('writes a bad date as the literal text it was given, for INVALID_DATE', () => {
      assert.equal(
        field(sheet, 'DATE_RECEIVED_FOR_REPROCESSING', 7),
        'not a date'
      )
    })

    it('lets a pinned field outrank the value derived for it', () => {
      assert.equal(field(sheet, 'NET_WEIGHT', 8), 12.5)
    })
  })

  it('restates a row id the plan repeats, so a later upload amends it', async () => {
    const sheet = await renderSheet({
      rows: {
        [RECEIVED]: [
          {
            rowId: 1001,
            fields: { WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE: 'Yes' }
          },
          { rowId: 1003 }
        ]
      }
    })

    assert.deepEqual(rowIds(sheet, 2), ['1001', '1003'])
    assert.equal(
      field(sheet, 'WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE', 4),
      'Yes'
    )
  })

  describe('given a seeded plan, rendered twice', () => {
    // What an amendment needs: the service reads any changed field as an
    // adjustment, so a restated row has to come back identical but for the
    // field the plan changed.
    const plan = (prnIssued) => ({
      rows: {
        [RECEIVED]: [
          {
            rowId: 1000,
            seed: 7,
            fields: {
              DATE_RECEIVED_FOR_REPROCESSING: '03/03/2026',
              WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE: prnIssued
            }
          },
          {
            rowId: 1001,
            seed: 8,
            fields: { DATE_RECEIVED_FOR_REPROCESSING: '04/03/2026' }
          }
        ]
      }
    })

    let firstRender
    let secondRender

    before(async () => {
      firstRender = cellsOf(await renderSheet(plan('No')))
      secondRender = cellsOf(await renderSheet(plan('Yes')))
    })

    it('changes only the field the plan changed', () => {
      const changed = firstRender
        .filter((cell, i) => cell !== secondRender[i])
        .map((cell) => cell.split('=')[0])

      assert.deepEqual(changed, ['J4'])
    })

    it('renders every other field the same way twice', () => {
      assert.equal(firstRender.length, secondRender.length)
      assert.ok(firstRender.length > 40)
    })
  })

  it('rejects a field the template does not carry', async () => {
    await assert.rejects(
      render({
        rows: { [RECEIVED]: [{ rowId: 1000, fields: { NOT_A_FIELD: 1 } }] }
      }),
      /NOT_A_FIELD/
    )
  })

  it('misplaces a metadata marker when the workbook is to be unreadable', async () => {
    const cover = await renderSheet(
      { unreadable: true, rows: { [RECEIVED]: [] } },
      'Cover'
    )

    const markers = []
    cover.getRow(1).eachCell((cell) => {
      if (String(cell.value).startsWith('__EPR_META_')) {
        markers.push(String(cell.value))
      }
    })

    assert.equal(markers.length, 2)
    assert.equal(markers[0], markers[1])
  })

  describe('given no row list', () => {
    it('invents the requested number of rows, numbered from the sheet base', async () => {
      const sheet = await renderSheet({ numberOfRows: 3 })

      assert.deepEqual(rowIds(sheet, 4), ['1000', '1001', '1002', null])
      assert.ok(field(sheet, 'EWC_CODE', 4))
    })

    it('honours a row offset', async () => {
      const sheet = await renderSheet({ numberOfRows: 2, rowOffset: 2 })

      assert.equal(valueOf(sheet.getCell('B6')), '1002')
      assert.equal(valueOf(sheet.getCell('B7')), '1003')
    })
  })
})
