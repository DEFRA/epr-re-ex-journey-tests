import { test } from '@playwright/test'
import { expect } from 'chai'
import { AuthClient } from '../support/auth.js'
import { BaseAPI } from '../apis/base-api.js'
import {
  createLinkedOrganisation,
  updateMigratedOrganisation
} from '../support/seeding/organisation.js'
import { generateNumbers } from '../support/reg-acc-number.js'
async function getOrganisation(baseAPI, authClient, refNo) {
  const response = await baseAPI.get(
    `/v1/organisations/${refNo}`,
    authClient.authHeader()
  )
  return response.body.json()
}

async function putOrganisation(baseAPI, authClient, refNo, data) {
  return baseAPI.put(
    `/v1/organisations/${refNo}`,
    JSON.stringify({ version: Number(data.version), updateFragment: data }),
    authClient.authHeader()
  )
}

test.describe('Organisation/accreditation cross-linking integrity @organisationAccreditationLinking', () => {
  const baseAPI = new BaseAPI()
  const authClient = new AuthClient()

  test.beforeAll(async () => {
    await authClient.authenticate()
  })

  test('rejects an accreditationId that is not a valid MongoDB ObjectId @orgAccreditationInvalidId', async () => {
    const org = await createLinkedOrganisation([
      {
        wasteProcessingType: 'Reprocessor',
        material: 'Glass (R5)',
        glassRecyclingProcess: 'Glass other'
      },
      {
        wasteProcessingType: 'Reprocessor',
        material: 'Glass (R5)',
        glassRecyclingProcess: 'Glass re-melt'
      }
    ])
    await updateMigratedOrganisation(org.refNo, [
      {
        reprocessingType: 'input',
        ...generateNumbers({
          wasteProcessingType: 'reprocessor',
          materialSuffix: 'GO'
        }),
        status: 'approved'
      },
      {
        reprocessingType: 'input',
        ...generateNumbers({
          wasteProcessingType: 'reprocessor',
          materialSuffix: 'GR'
        }),
        status: 'approved'
      }
    ])

    const data = await getOrganisation(baseAPI, authClient, org.refNo)
    data.registrations[0].accreditationId = 'invalid'

    const response = await putOrganisation(baseAPI, authClient, org.refNo, data)

    expect(response.statusCode).to.equal(422)
    const body = /** @type {any} */ (await response.body.json())
    expect(body.message).to.equal(
      'Invalid organisation data: registrations.0.accreditationId: id must be a valid MongoDB ObjectId'
    )
  })
})
