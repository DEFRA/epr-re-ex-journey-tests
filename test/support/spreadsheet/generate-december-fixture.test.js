import assert from 'node:assert/strict'
import { rmSync } from 'node:fs'
import { describe, it } from 'node:test'

import ExcelJS from 'exceljs'

import { generateDecemberFixture } from './generate-december-fixture.js'

const cases = [
  {
    wasteProcessingType: 'exporter',
    materialSuffix: 'WO',
    sheet: 'Exported (sections 1, 2 and 3)',
    exclusionColumns: ['J', 'AN', 'AO']
  },
  {
    wasteProcessingType: 'reprocessorInput',
    materialSuffix: 'PA',
    sheet: 'Received (sections 1, 2 and 3)',
    exclusionColumns: ['J']
  }
]

describe('the december fixture', () => {
  for (const {
    wasteProcessingType,
    materialSuffix,
    sheet,
    exclusionColumns
  } of cases) {
    it(`should keep every ${wasteProcessingType} load in the waste balance`, async () => {
      const filename = await generateDecemberFixture(
        { wasteProcessingType, materialSuffix, silentLogging: true },
        2027
      )
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.readFile(filename)
      rmSync(filename)
      const worksheet = workbook.getWorksheet(sheet)

      const excluded = [4, 5, 6, 7, 8, 9, 10, 11].flatMap((row) =>
        exclusionColumns
          .filter(
            (column) => worksheet?.getCell(`${column}${row}`).value !== 'No'
          )
          .map((column) => `${column}${row}`)
      )

      assert.deepEqual(excluded, [])
    })
  }
})
