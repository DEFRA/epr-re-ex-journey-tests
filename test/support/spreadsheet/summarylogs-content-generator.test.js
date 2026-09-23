import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import {
  generateSummaryLogContent,
  summaryLogContentFromFixture
} from './summarylogs-content-generator.js'
import { PROCESSING_TYPE_CONFIG } from './spreadsheet-config.js'
import { generateSpreadsheetData } from './summarylogs-spreadsheet-data-generator.js'

/** @import {Cell, SummaryLogContent, TableContent} from './summarylogs-content-generator.js' */
/** @import {PlannedRow} from './summarylogs-spreadsheet-data-generator.js' */

const RECEIVED = 'Received (sections 1, 2 and 3)'
const RECEIVED_TABLE = 'RECEIVED_LOADS_FOR_REPROCESSING'
const FIRST_DATA_ROW = 4

const baseOptions = {
  wasteProcessingType: 'reprocessorInput',
  materialSuffix: 'PA',
  regNumber: 'R26EPA500001-1',
  accNumber: 'A26EPA500001-1'
}

/** @param {Partial<typeof baseOptions> & {rows: Record<string, PlannedRow[]>}} options */
const generate = (options) =>
  generateSummaryLogContent({ ...baseOptions, ...options })

/**
 * The value a row carries under a header.
 *
 * @param {TableContent} table
 * @param {string} header
 * @param {number} index
 * @returns {Cell}
 */
function field(table, header, index) {
  const column = table.headers.indexOf(header)
  assert.ok(column >= 0, `no header ${header}`)
  return table.rows[index][column]
}

describe('summary log content generator', () => {
  describe('given a row list', () => {
    /** @type {SummaryLogContent} */
    let content
    /** @type {TableContent} */
    let table

    before(async () => {
      content = await generate({
        rows: {
          [RECEIVED]: [
            {
              rowId: 1000,
              fields: {
                DATE_RECEIVED_FOR_REPROCESSING: '03/02/2026',
                GROSS_WEIGHT: 200,
                TARE_WEIGHT: 20,
                PALLET_WEIGHT: 10
              }
            },
            { rowId: 1001 },
            {
              rowId: 1002,
              fields: { DATE_RECEIVED_FOR_REPROCESSING: 'not a date' }
            }
          ]
        }
      })
      table = content.data[RECEIVED_TABLE]
    })

    it('names the registration on the cover as the template lays it out', () => {
      assert.deepEqual(content.meta, {
        MATERIAL: 'Paper_and_board',
        REGISTRATION_NUMBER: 'R26EPA500001-1',
        ACCREDITATION_NUMBER: 'A26EPA500001-1'
      })
    })

    it('keys each worksheet by the table the service reads it as', () => {
      assert.deepEqual(Object.keys(content.data), [RECEIVED_TABLE])
    })

    it("heads the table with the template's fields, in column order, without the skipped columns", () => {
      assert.deepEqual(table.headers.slice(0, 4), [
        'ROW_ID',
        'DATE_RECEIVED_FOR_REPROCESSING',
        'EWC_CODE',
        'DESCRIPTION_WASTE'
      ])
      assert.ok(!table.headers.some((header) => header.startsWith('__EPR')))
    })

    it('carries exactly the planned rows, in order, one value per header', () => {
      assert.deepEqual(
        table.rows.map((row) => row[0]),
        ['1000', '1001', '1002']
      )
      for (const row of table.rows) {
        assert.equal(row.length, table.headers.length)
      }
    })

    it('pins a field named by its template marker', () => {
      assert.equal(field(table, 'GROSS_WEIGHT', 0), 200)
      assert.equal(field(table, 'NET_WEIGHT', 0), 170)
    })

    it('fills the fields a row leaves unplanned', () => {
      assert.ok(field(table, 'EWC_CODE', 1))
      const weight = field(table, 'GROSS_WEIGHT', 1)
      assert.equal(typeof weight, 'number')
      assert.ok(Number(weight) > 0)
    })

    it('writes a date as the calendar date the service reads off a sheet', () => {
      assert.equal(
        field(table, 'DATE_RECEIVED_FOR_REPROCESSING', 0),
        '2026-02-03'
      )
    })

    it('writes a bad date as the literal text it was given, for INVALID_DATE', () => {
      assert.equal(
        field(table, 'DATE_RECEIVED_FOR_REPROCESSING', 2),
        'not a date'
      )
    })
  })

  it('leaves out a worksheet the plan gives no rows', async () => {
    const content = await generate({
      rows: { [RECEIVED]: [{ rowId: 1000 }], 'Reprocessed (section 4)': [] }
    })

    assert.deepEqual(Object.keys(content.data), [RECEIVED_TABLE])
  })

  it('names no accreditation for a registered-only template', async () => {
    const content = await generate({
      wasteProcessingType: 'regOnlyReprocessor',
      accNumber: undefined,
      rows: { 'Received (section 1)': [{ rowId: 1000 }] }
    })

    assert.deepEqual(Object.keys(content.meta), [
      'MATERIAL',
      'REGISTRATION_NUMBER'
    ])
    assert.deepEqual(Object.keys(content.data), [RECEIVED_TABLE])
  })

  it('rejects a field the template does not carry', async () => {
    await assert.rejects(
      generate({
        rows: { [RECEIVED]: [{ rowId: 1000, fields: { NOT_A_FIELD: 1 } }] }
      }),
      /NOT_A_FIELD/
    )
  })

  it('rejects a worksheet this template would never carry', async () => {
    await assert.rejects(
      generate({ rows: { 'Received (sections 1 and 2)': [{ rowId: 1000 }] } }),
      /Received \(sections 1 and 2\)/
    )
  })

  describe('given a seeded plan', () => {
    // The service reads any changed field as an adjustment, so what the
    // route is sent has to be what the workbook would have carried.
    const rows = {
      [RECEIVED]: [
        {
          rowId: 1000,
          seed: 7,
          fields: {
            DATE_RECEIVED_FOR_REPROCESSING: '03/03/2026',
            GROSS_WEIGHT: 120
          }
        },
        { rowId: 1001, seed: 8 }
      ],
      'Sent on (sections 5, 6 and 7)': [
        {
          rowId: 5000,
          seed: 9,
          fields: { DATE_LOAD_LEFT_SITE: '05/03/2026' }
        }
      ]
    }

    /**
     * The value a sheet cell holds, as the service parses it.
     *
     * @param {import('exceljs').Cell} cell
     * @returns {Cell}
     */
    const parsed = (cell) => {
      const value =
        cell.value && typeof cell.value === 'object' && 'result' in cell.value
          ? cell.value.result
          : cell.value
      if (value instanceof Date) return value.toISOString().slice(0, 10)
      return (typeof value === 'string' && value !== '') ||
        typeof value === 'number'
        ? value
        : null
    }

    /**
     * Renders the rows both ways and asserts every value under every header
     * agrees, worksheet by worksheet.
     *
     * @param {string} wasteProcessingType
     * @param {Record<string, PlannedRow[]>} rows
     */
    async function assertParity(wasteProcessingType, rows) {
      const options = { ...baseOptions, wasteProcessingType, rows }
      const content = await generateSummaryLogContent(options)
      const file = await generateSpreadsheetData({
        ...options,
        silentLogging: true
      })
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.readFile(file)

      for (const worksheet of Object.keys(rows)) {
        const sheet = workbook.getWorksheet(worksheet)
        assert.ok(sheet, `no worksheet ${worksheet}`)
        /** @type {Record<string, number>} */
        const columns = {}
        /** @type {string | undefined} */
        let table
        sheet.getRow(1).eachCell((cell, column) => {
          const marker = String(cell.value)
          columns[marker] = column
          if (marker.startsWith('__EPR_DATA_')) {
            table = marker.slice('__EPR_DATA_'.length)
          }
        })
        assert.ok(table, `${worksheet} carries no data marker`)
        const { headers, rows: sent } = content.data[table]
        const fromSheet = rows[worksheet].map((_, index) =>
          headers.map((header) =>
            parsed(sheet.getCell(FIRST_DATA_ROW + index, columns[header]))
          )
        )
        assert.deepEqual(sent, fromSheet, worksheet)
      }
    }

    it('carries every value the workbook would, under the same field', async () => {
      await assertParity('reprocessorInput', rows)
    })

    for (const [wasteProcessingType, config] of Object.entries(
      PROCESSING_TYPE_CONFIG
    )) {
      it(`agrees with the ${wasteProcessingType} workbook on every worksheet`, async () => {
        await assertParity(
          wasteProcessingType,
          Object.fromEntries(
            config.worksheets.map((worksheet, i) => [
              worksheet.name,
              [
                { rowId: 1000 * (i + 1), seed: 10 + i },
                { rowId: 1000 * (i + 1) + 1, seed: 20 + i }
              ]
            ])
          )
        )
      })
    }
  })

  describe('summaryLogContentFromFixture', () => {
    it('reads a fixture built to isolate a few loads down to just those loads', async () => {
      // resources/exporter-reconciliation.xlsx (see
      // resources/generate-reconciliation-fixtures.mjs) keeps 4 real loads
      // scattered across an otherwise-blanked sheet, most of whose
      // "unfilled" rows still carry a formula cell ROW_ID never recalculated
      // to a cached result - the case a naive "any field is non-empty" read
      // would misread as data.
      const content = await summaryLogContentFromFixture(
        'resources/exporter-reconciliation.xlsx'
      )

      assert.deepEqual(content.meta, {
        MATERIAL: 'Paper_and_board',
        REGISTRATION_NUMBER: 'R26EX5000000002PA',
        ACCREDITATION_NUMBER: 'A26EX5000000002PA'
      })
      assert.deepEqual(Object.keys(content.data), ['RECEIVED_LOADS_FOR_EXPORT'])

      const table = content.data.RECEIVED_LOADS_FOR_EXPORT
      assert.equal(table.rows.length, 4)

      const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100
      const tonnages = table.rows.map((_, i) =>
        Number(field(table, 'TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED', i))
      )
      // The fixture generator refuses to write a fixture where
      // round-each-then-sum and sum-then-round agree, and prints this total
      // as EXPECTED - see report.reconciliation.exporter.e2e.js.
      assert.equal(
        round2(tonnages.reduce((sum, tonnage) => sum + round2(tonnage), 0)),
        8.03
      )
    })

    it('agrees with generateSummaryLogContent on a workbook rendered from the same rows', async () => {
      const rows = {
        [RECEIVED]: [
          {
            rowId: 1000,
            seed: 30,
            fields: { GROSS_WEIGHT: 200, TARE_WEIGHT: 20, PALLET_WEIGHT: 10 }
          },
          { rowId: 1001, seed: 31 }
        ]
      }
      const written = await generateSummaryLogContent({ ...baseOptions, rows })
      const file = await generateSpreadsheetData({
        ...baseOptions,
        rows,
        silentLogging: true
      })

      const readBack = await summaryLogContentFromFixture(file)

      assert.deepEqual(readBack.meta, written.meta)
      assert.deepEqual(readBack.data, written.data)
    })

    it('leaves out a worksheet the fixture carries no rows for', async () => {
      const content = await summaryLogContentFromFixture(
        'resources/exporter-reconciliation.xlsx'
      )

      assert.ok(!('SENT_ON_LOADS' in content.data))
    })
  })
})
