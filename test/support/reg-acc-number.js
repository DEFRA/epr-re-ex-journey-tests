// Registration/accreditation number format:
// [1]     R=registration, A=accreditation
// [2-3]   relevant year
// [4]     nation E/W/S/N
// [5]     R=reprocessor, X=exporter
// [6-11]  6-digit org id
// [12-15] serial
// [16-17] material
// e.g. A26ER5000270063WO

const DEFAULT_ORG_ID = '500000'
const DEFAULT_SERIAL = '0001'
const DEFAULT_NATION = 'E'

function currentYear() {
  return new Date().getFullYear().toString().slice(-2)
}

function processingTypeChar(wasteProcessingType) {
  return wasteProcessingType === 'exporter' ? 'X' : 'R'
}

function buildNumber(
  typeChar,
  {
    wasteProcessingType,
    materialSuffix,
    nation = DEFAULT_NATION,
    orgId = DEFAULT_ORG_ID,
    serial = DEFAULT_SERIAL,
    year = currentYear()
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
