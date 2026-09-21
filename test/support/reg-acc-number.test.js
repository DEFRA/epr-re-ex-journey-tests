import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { generateAccNumber, generateRegNumber } from './reg-acc-number.js'
import { PROCESSING_TYPE_CONFIG } from './spreadsheet/spreadsheet-config.js'

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
})
