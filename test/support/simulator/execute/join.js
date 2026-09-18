/**
 * What the seeders and the spreadsheet generator call a planned registration.
 *
 * The population plans a registration as `exporter` or `reprocessor` in a
 * nation named in full. The seeders take `Exporter` or `Reprocessor` with a
 * `reprocessingType` beside it, the generator renders one of five streams, and
 * a registration number wants the nation as a letter. This is the whole of the
 * translation between them.
 */

import { generateAccNumber, generateRegNumber } from '../../reg-acc-number.js'
import { createRandom } from '../population/random.js'

/** @import {PlannedOperator, PlannedRegistration} from '../population/population.js' */

/**
 * The nation as the register spells it at the fourth character of a number.
 *
 * @type {Record<string, 'E' | 'W' | 'S' | 'N' | undefined>}
 */
const NATION_LETTER = {
  England: 'E',
  Wales: 'W',
  Scotland: 'S',
  'Northern Ireland': 'N'
}

/**
 * @param {string} nation
 * @returns {'E' | 'W' | 'S' | 'N'}
 */
export function nationLetter(nation) {
  const letter = NATION_LETTER[nation]
  if (!letter) {
    throw new Error(`No registration number letter for the nation "${nation}"`)
  }
  return letter
}

/**
 * The regulator the service files the operator under, as the organisation's
 * `submittedToRegulator` spells it.
 *
 * @param {Pick<PlannedOperator, 'agency'>} operator
 * @returns {string}
 */
export const regulatorOf = (operator) => operator.agency.toLowerCase()

/**
 * @param {Pick<PlannedRegistration, 'processingType'>} registration
 * @returns {'Exporter' | 'Reprocessor'}
 */
export const seededProcessingType = (registration) =>
  registration.processingType === 'exporter' ? 'Exporter' : 'Reprocessor'

/**
 * Whether a reprocessing registration takes waste in or turns product out,
 * which every approved one has to declare. The row planner decides the stream
 * an accredited reprocessor files on; a registered-only one files on the
 * shorter received-and-sent-on template, which is an input log.
 *
 * @param {string} stream
 * @returns {'input' | 'output' | undefined}
 */
export function reprocessingTypeOf(stream) {
  if (stream === 'reprocessorOutput') return 'output'
  if (stream === 'reprocessorInput' || stream === 'regOnlyReprocessor') {
    return 'input'
  }
  return undefined
}

const POSTCODE_AREA_FIRST_LETTERS = 'ABCDEFGHIJKLMNOPRSTUWYZ'
const POSTCODE_AREA_SECOND_LETTERS = 'ABCDEFGHKLMNOPQRSTUVWXY'
const POSTCODE_UNIT_LETTERS = 'ABDEFGHJLNPQRSTUWXYZ'
const STREETS = [
  'Station Road',
  'Mill Lane',
  'Works Road',
  'Wharf Road',
  'Foundry Lane',
  'Dock Road'
]
const TOWNS = [
  'Wolverhampton',
  'Doncaster',
  'Swindon',
  'Port Talbot',
  'Falkirk',
  'Lisburn',
  'Grimsby',
  'Ellesmere Port'
]

/**
 * The address a planned site is seeded at, drawn from its id so every
 * registration on the site shares it. The service keys a reprocessor's site on
 * the postcode alone, and the plan names a site only by id.
 *
 * @param {string} siteId
 * @returns {{street: string, town: string, postcode: string}}
 */
export function siteAddress(siteId) {
  const random = createRandom(siteId)
  /** @param {ArrayLike<string>} members */
  const pick = (members) => members[random.int(0, members.length - 1)]
  const area =
    pick(POSTCODE_AREA_FIRST_LETTERS) + pick(POSTCODE_AREA_SECOND_LETTERS)
  const unit = pick(POSTCODE_UNIT_LETTERS) + pick(POSTCODE_UNIT_LETTERS)
  return {
    street: `${random.int(1, 200)} ${pick(STREETS)}`,
    town: pick(TOWNS),
    postcode: `${area}${random.int(1, 99)} ${random.int(0, 9)}${unit}`
  }
}

/**
 * What `createLinkedOrganisation` takes to apply for one planned registration.
 *
 * @param {PlannedRegistration} registration
 */
export const applicationRow = (registration) => ({
  wasteProcessingType: seededProcessingType(registration),
  material: registration.material.material,
  glassRecyclingProcess: registration.material.glassRecyclingProcess,
  ...(registration.siteId ? siteAddress(registration.siteId) : {}),
  tonnageBand: registration.accreditation?.tonnageBand,
  withoutAccreditation: registration.accreditation === null
})

/**
 * The registration and accreditation numbers granted to a planned
 * registration, built as the register builds them: the year it went active,
 * its nation, its processing type, the six-digit organisation id the service
 * assigned when the operator applied, and its serial within the operator.
 *
 * Taking the organisation id from the service is what keeps every number in a
 * run distinct from every other run's against the same database, with no
 * registry to keep. Nothing checks a seeded number for uniqueness, so a clash
 * would not be refused; it would sit in the register as two operators sharing
 * one number.
 *
 * @param {PlannedRegistration} registration
 * @param {{orgId: number | string, serial: number}} identity
 * @returns {{regNumber: string, accNumber: string | undefined}}
 */
export function numbersFor(registration, { orgId, serial }) {
  const options = {
    wasteProcessingType: registration.processingType,
    materialSuffix: registration.material.suffix,
    nation: nationLetter(registration.nation),
    orgId: String(orgId),
    serial: String(serial).padStart(4, '0'),
    year: registration.activeFrom.slice(2, 4)
  }
  return {
    regNumber: generateRegNumber(options),
    accNumber: registration.accreditation
      ? generateAccNumber(options)
      : undefined
  }
}
