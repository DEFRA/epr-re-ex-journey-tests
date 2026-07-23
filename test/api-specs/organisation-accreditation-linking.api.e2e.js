import { test } from '@playwright/test'
import { expect } from 'chai'
import { AuthClient } from '../support/auth.js'
import { BaseAPI } from '../apis/base-api.js'
import {
  createLinkedOrganisation,
  updateMigratedOrganisation
} from '../support/apicalls.js'

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

  test('rejects two registrations pointing at the same accreditationId @orgAccreditationDuplicateLink', async () => {
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
        regNumber: 'R25SR500030912PA',
        accNumber: 'ACC123456',
        status: 'approved'
      },
      {
        reprocessingType: 'input',
        regNumber: 'R25SR500040912PA',
        accNumber: 'ACC123456',
        status: 'approved'
      }
    ])

    const data = await getOrganisation(baseAPI, authClient, org.refNo)
    for (const registration of data.registrations) {
      registration.accreditationId = data.accreditations[0].id
    }

    const response = await putOrganisation(baseAPI, authClient, org.refNo, data)

    expect(response.statusCode).to.equal(422)
    const body = /** @type {any} */ (await response.body.json())
    expect(body.message).to.contain(
      'Each accreditation must be linked to at most one registration:'
    )
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
        regNumber: 'R25SR500030912PA',
        accNumber: 'ACC123456',
        status: 'approved'
      },
      {
        reprocessingType: 'input',
        regNumber: 'R25SR500040912PA',
        accNumber: 'ACC123456',
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

  test('rejects an accreditationId that does not exist @orgAccreditationNonExistentId', async () => {
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
        regNumber: 'R25SR500030912PA',
        accNumber: 'ACC123456',
        status: 'approved'
      },
      {
        reprocessingType: 'input',
        regNumber: 'R25SR500040912PA',
        accNumber: 'ACC123456',
        status: 'approved'
      }
    ])

    const data = await getOrganisation(baseAPI, authClient, org.refNo)
    data.registrations[0].accreditationId = '123456789012345678901234'

    const response = await putOrganisation(baseAPI, authClient, org.refNo, data)

    expect(response.statusCode).to.equal(422)
    const body = /** @type {any} */ (await response.body.json())
    expect(body.message).to.contain(
      'Registrations are linked to accreditations that do not exist'
    )
  })

  test('rejects swapped accreditationIds between Glass Re-melt and Other @orgAccreditationSwapSameMaterial', async () => {
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
        regNumber: 'R25SR500030912PA',
        accNumber: 'ACC123456',
        status: 'approved'
      },
      {
        reprocessingType: 'input',
        regNumber: 'R25SR500040912PA',
        accNumber: 'ACC123456',
        status: 'approved'
      }
    ])

    const data = await getOrganisation(baseAPI, authClient, org.refNo)
    const firstAccId = data.registrations[0].accreditationId
    data.registrations[0].accreditationId =
      data.registrations[1].accreditationId
    data.registrations[1].accreditationId = firstAccId

    const response = await putOrganisation(baseAPI, authClient, org.refNo, data)

    expect(response.statusCode).to.equal(422)
    const body = /** @type {any} */ (await response.body.json())
    expect(body.message).to.contain(
      'Registrations are linked to accreditations that do not match their type, material, or site:'
    )
  })

  test('rejects swapped accreditationIds between different materials and processing types @orgAccreditationSwapDifferentMaterial', async () => {
    const org = await createLinkedOrganisation([
      { wasteProcessingType: 'Reprocessor', material: 'Paper or board (R3)' },
      { wasteProcessingType: 'Exporter', material: 'Steel (R4)' }
    ])
    await updateMigratedOrganisation(org.refNo, [
      {
        reprocessingType: 'input',
        regNumber: 'R25SR500030912PA',
        accNumber: 'ACC123456',
        status: 'approved'
      },
      {
        regNumber: 'E25SR500040912PA',
        accNumber: 'ACC123456',
        status: 'approved'
      }
    ])

    const data = await getOrganisation(baseAPI, authClient, org.refNo)
    const firstAccId = data.registrations[0].accreditationId
    data.registrations[0].accreditationId =
      data.registrations[1].accreditationId
    data.registrations[1].accreditationId = firstAccId

    const response = await putOrganisation(baseAPI, authClient, org.refNo, data)

    expect(response.statusCode).to.equal(422)
    const body = /** @type {any} */ (await response.body.json())
    expect(body.message).to.contain(
      'Registrations are linked to accreditations that do not match their type, material, or site:'
    )
  })
})
