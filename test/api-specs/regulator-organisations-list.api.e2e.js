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

/** Every field the back office organisations table reads off a list item. */
const FIELDS_THE_BACK_OFFICE_TABLE_READS = [
  'id',
  'orgId',
  'companyDetails',
  'status',
  'submittedToRegulator',
  'registrations',
  'accreditations'
]

test.describe('The organisations list by credential @regulator @organisationsList', () => {
  const baseAPI = new BaseAPI()
  const regulator = new AuthClient()
  const admin = new AuthClient()

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

  test('gives a regulator the four columns its page renders and nothing else @regulatorListShape', async () => {
    const item = await listOneOrganisationAs(regulator)

    expect(Object.keys(item).sort()).to.deep.equal([
      'companyDetails',
      'id',
      'orgId',
      'status',
      'submittedToRegulator'
    ])
    expect(item.companyDetails).to.deep.equal({ name: companyName })
    expect(item.orgId).to.equal(orgId)
    expect(item.status).to.equal('approved')
  })

  for (const field of FIELDS_NO_LIST_ITEM_MAY_CARRY) {
    test(`keeps ${field} out of the regulator's list @regulatorListShape`, async () => {
      const item = await listOneOrganisationAs(regulator)

      expect(item).to.not.have.property(field)
    })
  }

  /**
   * The Regulator column reads `submittedToRegulator` behind a `?? ''`, so
   * dropping the field blanks the column rather than failing. This asserts it
   * by name for that reason.
   */
  test('carries the supervising regulator, which the regulator page renders @regulatorListShape', async () => {
    const item = await listOneOrganisationAs(regulator)

    expect(item.submittedToRegulator).to.equal('ea')
  })

  test('gives the back office every field its organisations table reads @adminListShape', async () => {
    const item = await listOneOrganisationAs(admin)

    expect(Object.keys(item).sort()).to.deep.equal(
      [...FIELDS_THE_BACK_OFFICE_TABLE_READS].sort()
    )
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

  for (const field of FIELDS_NO_LIST_ITEM_MAY_CARRY) {
    test(`keeps ${field} out of the back office list as well @adminListShape`, async () => {
      const item = await listOneOrganisationAs(admin)

      expect(item).to.not.have.property(field)
    })
  }
})
