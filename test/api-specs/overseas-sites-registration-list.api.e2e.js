import { test } from '@playwright/test'
import { expect } from 'chai'
import { AuthClient } from '../support/auth.js'
import { BaseAPI } from '../apis/base-api.js'
import {
  createLinkedOrganisation,
  updateMigratedOrganisation,
  seedOverseasSites
} from '../support/seeding/organisation.js'

// Overseas sites are only valid on Exporter registrations - epr-backend's
// registration schema forbids the field entirely for Reprocessor.
/**
 * @param {{
 *   regNumber: string,
 *   accNumber?: string,
 *   withoutAccreditation?: boolean
 * }} options
 */
async function approvedExporter({
  regNumber,
  accNumber,
  withoutAccreditation
}) {
  const org = await createLinkedOrganisation([
    { wasteProcessingType: 'Exporter', material: 'Paper or board (R3)' }
  ])
  const migrated = await updateMigratedOrganisation(org.refNo, [
    {
      regNumber,
      accNumber,
      status: 'approved',
      withoutAccreditation
    }
  ])
  return {
    refNo: org.refNo,
    registrationId: migrated.registrationIds[0]
  }
}

function overseasSitesPath(refNo, registrationId) {
  return `/v1/organisations/${refNo}/registrations/${registrationId}/overseas-sites`
}

function expectSeededSiteDetail(body, orsIds) {
  expect(Object.keys(body)).to.have.members(orsIds)
  for (const orsId of orsIds) {
    expect(body[orsId].name).to.equal('Test Overseas Reprocessor')
    expect(body[orsId].country).to.equal('Germany')
    expect(body[orsId].address).to.deep.equal({
      line1: '1 Test Street',
      townOrCity: 'Test City'
    })
    expect(new Date(body[orsId].validFrom).toISOString()).to.equal(
      '2024-01-01T00:00:00.000Z'
    )
  }
}

test.describe('Overseas sites registration list @overseasSitesRegistrationList', () => {
  const baseAPI = new BaseAPI()
  const authClient = new AuthClient()

  test.beforeAll(async () => {
    await authClient.authenticate()
  })

  test('returns seeded overseas site detail for a registration holding an accreditation @overseasSitesRegistrationAccredited', async () => {
    const { refNo, registrationId } = await approvedExporter({
      regNumber: 'E25SR500030917PA',
      accNumber: 'E-ACC123461'
    })

    await seedOverseasSites(refNo, [0], [100, 101])

    const response = await baseAPI.get(
      overseasSitesPath(refNo, registrationId),
      authClient.authHeader()
    )

    expect(response.statusCode).to.equal(200)
    const body = /** @type {any} */ (await response.body.json())
    expectSeededSiteDetail(body, ['100', '101'])
  })

  // The reason this route exists: the accreditation-keyed sibling 404s for a
  // registration holding no accreditation, so a registered-only exporter's
  // sites could be listed by ORS id but never resolved to a name.
  test('returns seeded overseas site detail for a registration holding no accreditation @overseasSitesRegistrationUnaccredited', async () => {
    const { refNo, registrationId } = await approvedExporter({
      regNumber: 'E25SR500030918PA',
      withoutAccreditation: true
    })

    await seedOverseasSites(refNo, [0], [102])

    const response = await baseAPI.get(
      overseasSitesPath(refNo, registrationId),
      authClient.authHeader()
    )

    expect(response.statusCode).to.equal(200)
    const body = /** @type {any} */ (await response.body.json())
    expectSeededSiteDetail(body, ['102'])
  })

  test('returns an empty object when the registration has no overseas sites @overseasSitesRegistrationEmpty', async () => {
    const { refNo, registrationId } = await approvedExporter({
      regNumber: 'E25SR500030919PA',
      withoutAccreditation: true
    })

    const response = await baseAPI.get(
      overseasSitesPath(refNo, registrationId),
      authClient.authHeader()
    )

    expect(response.statusCode).to.equal(200)
    const body = /** @type {any} */ (await response.body.json())
    expect(body).to.deep.equal({})
  })

  test('404s for a registration that does not belong to the organisation @overseasSitesRegistrationNotFound', async () => {
    const { refNo } = await approvedExporter({
      regNumber: 'E25SR500030920PA',
      withoutAccreditation: true
    })

    const response = await baseAPI.get(
      overseasSitesPath(refNo, '68b0000000000000000000ff'),
      authClient.authHeader()
    )

    expect(response.statusCode).to.equal(404)
  })
})
