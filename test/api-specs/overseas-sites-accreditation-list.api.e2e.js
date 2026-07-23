import { test } from '@playwright/test'
import { expect } from 'chai'
import { AuthClient } from '../support/auth.js'
import { BaseAPI } from '../apis/base-api.js'
import {
  createLinkedOrganisation,
  updateMigratedOrganisation,
  seedOverseasSites
} from '../support/apicalls.js'

async function getOrganisation(baseAPI, authClient, refNo) {
  const response = await baseAPI.get(
    `/v1/organisations/${refNo}`,
    authClient.authHeader()
  )
  return response.body.json()
}

// Overseas sites are only valid on Exporter registrations - epr-backend's
// registration schema forbids the field entirely for Reprocessor
// (registration.js: `overseasSites: Joi.when('wasteProcessingType', { is:
// EXPORTER, then: ..., otherwise: Joi.forbidden() })`) - matching the
// already-working accredited.exporter.report.e2e.js/report.stale.e2e.js UI
// specs' own setup, not a Reprocessor one.
async function approvedExporterWithAccreditation(
  baseAPI,
  authClient,
  regNumber = 'E25SR500030912PA',
  accNumber = 'E-ACC123456'
) {
  const org = await createLinkedOrganisation([
    { wasteProcessingType: 'Exporter', material: 'Paper or board (R3)' }
  ])
  const migrated = await updateMigratedOrganisation(org.refNo, [
    {
      regNumber,
      accNumber,
      status: 'approved'
    }
  ])
  return {
    refNo: org.refNo,
    registrationId: migrated.registrationIds[0],
    accreditationId: migrated.accreditationIds[0]
  }
}

function overseasSitesPath(refNo, registrationId, accreditationId) {
  return `/v1/organisations/${refNo}/registrations/${registrationId}/accreditations/${accreditationId}/overseas-sites`
}

test.describe('Overseas sites accreditation list @overseasSitesAccreditationList', () => {
  const baseAPI = new BaseAPI()
  const authClient = new AuthClient()

  test.beforeAll(async () => {
    await authClient.authenticate()
  })

  test('returns seeded overseas site detail keyed by ORS id @overseasSitesHappyPath', async () => {
    const { refNo, registrationId, accreditationId } =
      await approvedExporterWithAccreditation(baseAPI, authClient)

    await seedOverseasSites(refNo, [0], [100, 101])

    const response = await baseAPI.get(
      overseasSitesPath(refNo, registrationId, accreditationId),
      authClient.authHeader()
    )

    expect(response.statusCode).to.equal(200)
    const body = /** @type {any} */ (await response.body.json())
    expect(Object.keys(body)).to.have.members(['100', '101'])
    for (const orsId of ['100', '101']) {
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
  })

  test('returns an empty object when the registration has no overseas sites @overseasSitesEmpty', async () => {
    const { refNo, registrationId, accreditationId } =
      await approvedExporterWithAccreditation(
        baseAPI,
        authClient,
        'E25SR500030913PA',
        'E-ACC123457'
      )

    const response = await baseAPI.get(
      overseasSitesPath(refNo, registrationId, accreditationId),
      authClient.authHeader()
    )

    expect(response.statusCode).to.equal(200)
    const body = /** @type {any} */ (await response.body.json())
    expect(body).to.deep.equal({})
  })

  test('resolves an overseasSiteId with no matching site record to null detail @overseasSitesMissingSiteRecord', async () => {
    const { refNo, registrationId, accreditationId } =
      await approvedExporterWithAccreditation(
        baseAPI,
        authClient,
        'E25SR500030914PA',
        'E-ACC123458'
      )

    // put-by-id.js's validateOverseasSiteReferences rejects a PUT that links
    // to a non-existent site outright (422 "Overseas site(s) not found"), so
    // the only real way to reach a dangling reference is to link a real site
    // then delete it afterwards (DELETE /v1/overseas-sites/{id} has no
    // referential check) - matching what resolveOverseasSites' null-fallback
    // is actually guarding against.
    await seedOverseasSites(refNo, [0], [100])
    const seededData = await getOrganisation(baseAPI, authClient, refNo)
    const overseasSiteId =
      seededData.registrations[0].overseasSites['100'].overseasSiteId

    const deleteResponse = await baseAPI.delete(
      `/v1/overseas-sites/${overseasSiteId}`,
      authClient.authHeader()
    )
    expect(deleteResponse.statusCode).to.equal(204)

    const response = await baseAPI.get(
      overseasSitesPath(refNo, registrationId, accreditationId),
      authClient.authHeader()
    )

    expect(response.statusCode).to.equal(200)
    const body = /** @type {any} */ (await response.body.json())
    expect(body['100']).to.deep.equal({
      name: null,
      country: null,
      address: null,
      coordinates: null,
      validFrom: null
    })
  })

  test('keeps overseas sites isolated per registration within the same organisation @overseasSitesCrossLinkingIsolation', async () => {
    const org = await createLinkedOrganisation([
      { wasteProcessingType: 'Exporter', material: 'Paper or board (R3)' },
      { wasteProcessingType: 'Exporter', material: 'Steel (R4)' }
    ])
    const migrated = await updateMigratedOrganisation(org.refNo, [
      {
        regNumber: 'E25SR500030915PA',
        accNumber: 'E-ACC123459',
        status: 'approved'
      },
      {
        regNumber: 'E25SR500040915ST',
        accNumber: 'E-ACC654321',
        status: 'approved'
      }
    ])

    // Seed overseas sites on registration 0 only.
    await seedOverseasSites(org.refNo, [0], [100])

    const response = await baseAPI.get(
      overseasSitesPath(
        org.refNo,
        migrated.registrationIds[1],
        migrated.accreditationIds[1]
      ),
      authClient.authHeader()
    )

    expect(response.statusCode).to.equal(200)
    const body = /** @type {any} */ (await response.body.json())
    expect(body).to.deep.equal({})
  })

  test('rejects an accreditationId that does not belong to the requested registration @overseasSitesAccreditationMismatch', async () => {
    const org = await createLinkedOrganisation([
      { wasteProcessingType: 'Exporter', material: 'Paper or board (R3)' },
      { wasteProcessingType: 'Exporter', material: 'Steel (R4)' }
    ])
    const migrated = await updateMigratedOrganisation(org.refNo, [
      {
        regNumber: 'E25SR500030916PA',
        accNumber: 'E-ACC123460',
        status: 'approved'
      },
      {
        regNumber: 'E25SR500040916ST',
        accNumber: 'E-ACC654322',
        status: 'approved'
      }
    ])

    const response = await baseAPI.get(
      overseasSitesPath(
        org.refNo,
        migrated.registrationIds[0],
        migrated.accreditationIds[1]
      ),
      authClient.authHeader()
    )

    expect(response.statusCode).to.equal(404)
    const body = /** @type {any} */ (await response.body.json())
    expect(body.message).to.contain('not found for registration')
  })
})
