import { test } from '@playwright/test'
import { expect } from 'chai'
import { AuthClient } from '../support/auth.js'
import { BaseAPI } from '../apis/base-api.js'
import {
  createLinkedOrganisation,
  FAKE_ACCREDITATION_NUMBER,
  FAKE_REGISTRATION_NUMBER,
  updateMigratedOrganisation
} from '../support/apicalls.js'

/**
 * An organisation document holds personal data about two sets of people: the
 * operator's own staff, and Defra staff. These are the fields that carry it,
 * plus the form submission behind the record. The organisations list
 * enumerates the whole population of operators, so none of them belongs in it.
 */
const FIELDS_NO_LIST_ITEM_MAY_CARRY = [
  'users',
  'linkedDefraOrganisation',
  'formSubmission',
  'statusHistory',
  'submitterContactDetails',
  'managementContactDetails'
]

/** Every field a list item carries, whoever asks for it. */
const LIST_ITEM_FIELDS = [
  'accreditations',
  'companyDetails',
  'id',
  'orgId',
  'registrations',
  'status',
  'submittedToRegulator'
]

/**
 * A registration line and an accreditation line carry the numbers the public
 * register publishes and the id that pairs the two. A line omits a key it
 * holds no value for, so these read as "nothing but these", not "exactly
 * these".
 */
const KEYS_A_REGISTRATION_LINE_MAY_CARRY = [
  'registrationNumber',
  'accreditationId'
]
const KEYS_AN_ACCREDITATION_LINE_MAY_CARRY = ['id', 'accreditationNumber']

/**
 * @param {Record<string, any>[]} lines
 * @param {string[]} permitted
 * @returns {string[]}
 */
const keysBeyond = (lines, permitted) =>
  lines
    .flatMap((line) => Object.keys(line))
    .filter((key) => !permitted.includes(key))

test.describe('The organisations list @regulator @organisationsList', () => {
  const baseAPI = new BaseAPI()
  const regulator = new AuthClient()
  const admin = new AuthClient()

  /**
   * Both credentials that reach this route, so each assertion runs for both.
   *
   * @type {Array<[string, () => AuthClient]>}
   */
  const CREDENTIALS = [
    ['a regulator', () => regulator],
    ['an admin', () => admin]
  ]

  /** @type {string} */
  let companyName
  /** @type {number} */
  let orgId

  test.beforeAll(async () => {
    await regulator.authenticateAsRegulator()
    await admin.authenticate()

    const linkedOrganisation = await createLinkedOrganisation([
      { material: 'Paper or board (R3)', wasteProcessingType: 'Reprocessor' }
    ])

    // Numbering the registration approves it, which is the state a regulator
    // has any reason to look at, and gives the list a number to carry.
    await updateMigratedOrganisation(linkedOrganisation.refNo, [
      {
        regNumber: FAKE_REGISTRATION_NUMBER,
        accNumber: FAKE_ACCREDITATION_NUMBER,
        status: 'approved',
        reprocessingType: 'input'
      }
    ])

    companyName = linkedOrganisation.organisation.companyName
    orgId = linkedOrganisation.orgId
  })

  /**
   * The seeded company name carries a random suffix, so searching for it
   * returns exactly one row and the assertions below read that row.
   *
   * @param {AuthClient} authClient
   * @returns {Promise<Record<string, any>>}
   */
  async function listOneOrganisationAs(authClient) {
    const response = await baseAPI.get(
      `/v1/organisations?search=${encodeURIComponent(companyName)}&page=1&pageSize=10`,
      authClient.authHeader()
    )
    expect(response.statusCode).to.equal(200)

    /**
     * @typedef {Object} OrganisationsPage
     * @property {Record<string, any>[]} items
     * @property {number} page
     * @property {number} pageSize
     * @property {number} totalItems
     * @property {number} totalPages
     */
    const page = /** @type {OrganisationsPage} */ (await response.body.json())
    expect(page.items).to.have.lengthOf(1)
    return page.items[0]
  }

  for (const [label, credential] of CREDENTIALS) {
    test(`gives ${label} the organisation identity and the published numbers @listShape`, async () => {
      const item = await listOneOrganisationAs(credential())

      expect(Object.keys(item).sort()).to.deep.equal(LIST_ITEM_FIELDS)
      expect(item.companyDetails).to.deep.equal({ name: companyName })
      expect(item.orgId).to.equal(orgId)
      expect(item.status).to.equal('approved')
      expect(item.registrations[0].registrationNumber).to.equal(
        FAKE_REGISTRATION_NUMBER
      )
      expect(item.accreditations[0].accreditationNumber).to.equal(
        FAKE_ACCREDITATION_NUMBER
      )
      expect(item.registrations[0].accreditationId).to.equal(
        item.accreditations[0].id
      )
    })

    test(`keeps ${label}'s registration and accreditation lines down to the published numbers @listShape`, async () => {
      const item = await listOneOrganisationAs(credential())

      expect(
        keysBeyond(item.registrations, KEYS_A_REGISTRATION_LINE_MAY_CARRY)
      ).to.deep.equal([])
      expect(
        keysBeyond(item.accreditations, KEYS_AN_ACCREDITATION_LINE_MAY_CARRY)
      ).to.deep.equal([])
    })

    /**
     * The Regulator column reads `submittedToRegulator` behind a `?? ''`, so
     * dropping the field blanks the column rather than failing. This asserts it
     * by name for that reason.
     */
    test(`carries the supervising regulator to ${label} @listShape`, async () => {
      const item = await listOneOrganisationAs(credential())

      expect(item.submittedToRegulator).to.equal('ea')
    })

    for (const field of FIELDS_NO_LIST_ITEM_MAY_CARRY) {
      test(`keeps ${field} out of ${label}'s list @listShape`, async () => {
        const item = await listOneOrganisationAs(credential())

        expect(item).to.not.have.property(field)
      })
    }
  }
})
