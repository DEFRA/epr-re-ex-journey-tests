import { test } from '@playwright/test'
import { expect } from 'chai'
import { AuthClient } from '../support/auth.js'
import { BaseAPI } from '../apis/base-api.js'
import {
  createAndRegisterDefraIdUser,
  linkDefraIdUser
} from '../support/defra-id-linking.js'
import {
  createLinkedOrganisation,
  updateMigratedOrganisation
} from '../support/seeding/organisation.js'
import { generateNumbers } from '../support/reg-acc-number.js'

async function setUpApprovedReprocessor() {
  const org = await createLinkedOrganisation([
    { wasteProcessingType: 'Reprocessor' }
  ])
  const numbers = generateNumbers({
    wasteProcessingType: 'reprocessor',
    materialSuffix: 'PA'
  })
  const migrated = await updateMigratedOrganisation(org.refNo, [
    { reprocessingType: 'input', ...numbers, status: 'approved' }
  ])
  return { org, migrated, numbers }
}

test.describe('Organisation linking/unlinking negative paths @organisationLinking', () => {
  const baseAPI = new BaseAPI()
  const authClient = new AuthClient()

  test.beforeAll(async () => {
    await authClient.authenticate()
  })

  test('rejects unlinking an organisation that is not linked @orgUnlinkNotLinked', async () => {
    const { org, migrated } = await setUpApprovedReprocessor()
    const user = await createAndRegisterDefraIdUser(migrated.email)
    await linkDefraIdUser(org.refNo, user.userId, migrated.email)

    const firstUnlink = await baseAPI.delete(
      `/v1/organisations/${org.refNo}/link`,
      authClient.authHeader()
    )
    expect(firstUnlink.statusCode).to.equal(204)

    const secondUnlink = await baseAPI.delete(
      `/v1/organisations/${org.refNo}/link`,
      authClient.authHeader()
    )
    expect(secondUnlink.statusCode).to.equal(409)
    const body = /** @type {any} */ (await secondUnlink.body.json())
    expect(body.message).to.equal(
      'Organisation is not linked so cannot be unlinked'
    )
  })
})
