import { test } from '@playwright/test'
import { expect } from 'chai'
import { AuthClient } from '../support/auth.js'
import { BaseAPI } from '../apis/base-api.js'
import {
  createLinkedOrganisation,
  updateMigratedOrganisation
} from '../support/seeding/organisation.js'
import { generateNumbers } from '../support/reg-acc-number.js'

function overseasSitesPath(refNo, registrationId, accreditationId) {
  return `/v1/organisations/${refNo}/registrations/${registrationId}/accreditations/${accreditationId}/overseas-sites`
}

test.describe('Overseas sites accreditation list @overseasSitesAccreditationList', () => {
  const baseAPI = new BaseAPI()
  const authClient = new AuthClient()

  test.beforeAll(async () => {
    await authClient.authenticate()
  })

  test('rejects an accreditationId that does not belong to the requested registration @overseasSitesAccreditationMismatch', async () => {
    const org = await createLinkedOrganisation([
      { wasteProcessingType: 'Exporter', material: 'Paper or board (R3)' },
      { wasteProcessingType: 'Exporter', material: 'Steel (R4)' }
    ])
    const migrated = await updateMigratedOrganisation(org.refNo, [
      {
        ...generateNumbers({
          wasteProcessingType: 'exporter',
          materialSuffix: 'PA'
        }),
        status: 'approved'
      },
      {
        ...generateNumbers({
          wasteProcessingType: 'exporter',
          materialSuffix: 'ST'
        }),
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
