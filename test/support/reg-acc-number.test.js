import assert from 'node:assert/strict'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import { generateAccNumber, generateRegNumber } from './reg-acc-number.js'
import { evaluateUnderClock } from './simulator/clock/under-clock.js'
import { PROCESSING_TYPE_CONFIG } from './spreadsheet/spreadsheet-config.js'

const module = join(
  dirname(fileURLToPath(import.meta.url)),
  'reg-acc-number.js'
)

const options = { materialSuffix: 'PA', year: '26' }

/**
 * The letter at the fifth character: R for a reprocessor, X for an exporter.
 *
 * @param {string} wasteProcessingType
 */
const processingLetter = (wasteProcessingType) =>
  generateRegNumber({ ...options, wasteProcessingType }).charAt(4)

/** The letter each stream the spreadsheet generator renders takes. */
const STREAM_LETTERS = {
  exporter: 'X',
  reprocessorInput: 'R',
  reprocessorOutput: 'R',
  regOnlyExporter: 'X',
  regOnlyReprocessor: 'R'
}

describe('registration and accreditation numbers', () => {
  it('carry the type, year, nation, org id, serial and material in order', () => {
    assert.equal(
      generateRegNumber({ ...options, wasteProcessingType: 'reprocessor' }),
      'R26ER5000000001PA'
    )
    assert.equal(
      generateRegNumber({ ...options, wasteProcessingType: 'exporter' }),
      'R26EX5000000001PA'
    )
    assert.equal(
      generateAccNumber({ ...options, wasteProcessingType: 'reprocessor' }),
      'A26ER5000000001PA'
    )
  })

  it("mark the seeders' reprocessor R and their exporter X", () => {
    assert.equal(processingLetter('reprocessor'), 'R')
    assert.equal(processingLetter('exporter'), 'X')
  })

  it('mark every stream the spreadsheet generator renders by its operator', () => {
    assert.deepEqual(
      Object.keys(STREAM_LETTERS).sort(),
      Object.keys(PROCESSING_TYPE_CONFIG).sort()
    )
    for (const [stream, letter] of Object.entries(STREAM_LETTERS)) {
      assert.equal(processingLetter(stream), letter, stream)
    }
  })

  it('refuse a processing type the register does not letter', () => {
    assert.throws(() => processingLetter('Exporter'), /"Exporter"/)
  })

  for (const { instant, year } of [
    { instant: '2027-12-31T23:59:00Z', year: '27' },
    { instant: '2028-01-01T00:00:30Z', year: '28' }
  ]) {
    it(`carry ${year} as the relevant year at ${instant} unless told otherwise`, () => {
      const number = evaluateUnderClock(
        instant,
        `const { generateRegNumber } = await import('${module}')
         console.log(generateRegNumber({ materialSuffix: 'PA', wasteProcessingType: 'reprocessor' }))`
      )

      assert.equal(number, `R${year}ER5000000001PA`)
    })
  }
})
