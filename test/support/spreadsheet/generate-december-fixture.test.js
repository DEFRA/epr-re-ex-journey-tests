import assert from 'node:assert/strict'
import { rmSync } from 'node:fs'
import { before, describe, it } from 'node:test'

import ExcelJS from 'exceljs'

import { generateDecemberFixture } from './generate-december-fixture.js'

const ACCREDITATION_YEAR = 2027
const LOAD_ROWS = [4, 5, 6, 7, 8, 9, 10, 11]
const NON_DECEMBER_ROWS = [8, 9, 10, 11]

const cases = [
  {
    wasteProcessingType: 'exporter',
    materialSuffix: 'WO',
    sheet: 'Exported (sections 1, 2 and 3)',
    dateColumn: 'Y',
    exclusionColumns: ['J', 'AN', 'AO']
  },
  {
    wasteProcessingType: 'reprocessorInput',
    materialSuffix: 'PA',
    sheet: 'Received (sections 1, 2 and 3)',
    dateColumn: 'G',
    exclusionColumns: ['J']
  }
]

describe('the december fixture', () => {
  for (const {
    wasteProcessingType,
    materialSuffix,
    sheet,
    dateColumn,
    exclusionColumns
  } of cases) {
    describe(`for an ${wasteProcessingType}`, () => {
      /** @type {import('exceljs').Worksheet | undefined} */
      let worksheet

      before(async () => {
        const filename = await generateDecemberFixture(
          { wasteProcessingType, materialSuffix, silentLogging: true },
          ACCREDITATION_YEAR
        )
        const workbook = new ExcelJS.Workbook()
        await workbook.xlsx.readFile(filename)
        rmSync(filename)
        worksheet = workbook.getWorksheet(sheet)
      })

      it('should keep every load in the waste balance', () => {
        const excluded = LOAD_ROWS.flatMap((row) =>
          exclusionColumns
            .filter(
              (column) => worksheet?.getCell(`${column}${row}`).value !== 'No'
            )
            .map((column) => `${column}${row}`)
        )

        assert.deepEqual(excluded, [])
      })

      it('should date the non-december loads in the accreditation year, outside december', () => {
        const misdated = NON_DECEMBER_ROWS.flatMap((row) => {
          const date = /** @type {Date} */ (
            worksheet?.getCell(`${dateColumn}${row}`).value
          )
          return date.getFullYear() === ACCREDITATION_YEAR &&
            date.getMonth() !== 11
            ? []
            : [`${dateColumn}${row} ${date.toISOString()}`]
        })

        assert.deepEqual(misdated, [])
      })
    })
  }
})
