import { randomInt } from 'node:crypto'

import { currentYear } from './date.js'

// Registration/accreditation number format:
// [1]     R=registration, A=accreditation
// [2-3]   relevant year
// [4]     nation E/W/S/N
// [5]     R=reprocessor, X=exporter
// [6-11]  6-digit org id
// [12-15] serial
// [16-17] material
// e.g. A26ER5000270063WO
//
// No two organisations may hold the same number, and a database that is not
// torn down keeps the numbers of every earlier run. So the org id and serial
// are drawn at random unless the caller gives them.

const DEFAULT_NATION = 'E'

const twoDigitYear = () => String(currentYear()).slice(-2)

/** @param {number} length */
const randomDigits = (length) =>
  String(randomInt(10 ** length)).padStart(length, '0')

const PROCESSING_TYPE_LETTERS = {
  exporter: 'X',
  regOnlyExporter: 'X',
  reprocessor: 'R',
  reprocessorInput: 'R',
  reprocessorOutput: 'R',
  regOnlyReprocessor: 'R'
}

/** @typedef {keyof typeof PROCESSING_TYPE_LETTERS} ProcessingType */

function processingTypeChar(wasteProcessingType) {
  const letter = PROCESSING_TYPE_LETTERS[wasteProcessingType]
  if (!letter) {
    throw new Error(
      `No registration number letter for the processing type "${wasteProcessingType}"`
    )
  }
  return letter
}

function buildNumber(
  typeChar,
  {
    wasteProcessingType,
    materialSuffix,
    nation = DEFAULT_NATION,
    orgId = randomDigits(6),
    serial = randomDigits(4),
    year = twoDigitYear()
  }
) {
  return `${typeChar}${year}${nation}${processingTypeChar(wasteProcessingType)}${orgId}${serial}${materialSuffix}`
}

export function generateRegNumber(options) {
  return buildNumber('R', options)
}

export function generateAccNumber(options) {
  return buildNumber('A', options)
}

/**
 * A registration number and its accreditation number, sharing one org id and
 * serial.
 *
 * @param {{wasteProcessingType: ProcessingType, materialSuffix: string, nation?: string, year?: string}} options
 * @returns {{regNumber: string, accNumber: string}}
 */
export function generateNumbers(options) {
  const shared = { orgId: randomDigits(6), serial: randomDigits(4), ...options }
  return {
    regNumber: generateRegNumber(shared),
    accNumber: generateAccNumber(shared)
  }
}
