import { test } from '@playwright/test'
import { expect } from 'chai'
import { AuthClient } from '../support/auth.js'
import { BaseAPI } from '../apis/base-api.js'
import { defraIdStub } from '../support/defra-id-stub.js'
import Users from '../support/users.js'
import { registrationStartYear } from '../support/seeding/summary-logs.js'
import {
  createAndRegisterDefraIdUser,
  linkDefraIdUser
} from '../support/defra-id-linking.js'
import {
  createLinkedOrganisation,
  updateMigratedOrganisation
} from '../support/seeding/organisation.js'
import { generateNumbers } from '../support/reg-acc-number.js'
import { registrationPath } from '../support/seeding/natural-key-paths.js'

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

// Mirrors linkDefraIdUser's own register+authorise+generateToken sequence,
// but without the final link POST (and its own success assertion) - needed
// for tests that expect the link attempt itself to fail.
async function registerAuthorisedUser(email) {
  const user = await createAndRegisterDefraIdUser(email)
  const users = new Users()
  const payload = await users.authorisationPayload(email)
  const response = await defraIdStub.authorise(payload)
  const sessionId = response.split('sessionId=')[1]
  const tokenPayload = await users.tokenPayload(sessionId)
  await defraIdStub.generateToken(JSON.stringify(tokenPayload), user.userId)
  return user
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

  test('rejects a linked user accessing another organisation @orgCrossOrganisationAccessRejected', async () => {
    const { org, migrated, numbers } = await setUpApprovedReprocessor()
    const user = await createAndRegisterDefraIdUser(migrated.email)
    await linkDefraIdUser(org.refNo, user.userId, migrated.email)

    const otherOrganisationNumber = '999999'
    const response = await baseAPI.post(
      `/organisations/${otherOrganisationNumber}/registrations/${numbers.regNumber}/summary-logs/${registrationStartYear()}`,
      JSON.stringify({ redirectUrl: 'test-redirect' }),
      defraIdStub.authHeader(user.userId)
    )

    expect(response.statusCode).to.equal(403)
    const body = /** @type {any} */ (await response.body.json())
    expect(body.message).to.equal('Insufficient scope')
  })

  test('rejects an unlinked user accessing a recently linked organisation @orgUnlinkedUserAccessRejected', async () => {
    const { org, migrated } = await setUpApprovedReprocessor()
    const linkedUser = await createAndRegisterDefraIdUser(migrated.email)
    await linkDefraIdUser(org.refNo, linkedUser.userId, migrated.email)

    const unlinkedUser = await registerAuthorisedUser(
      'anothertest123456@testuserz.com'
    )
    const response = await baseAPI.post(
      `${await registrationPath(org.refNo, migrated.registrationIds[0])}/summary-logs/${registrationStartYear()}`,
      JSON.stringify({ redirectUrl: 'test-redirect' }),
      defraIdStub.authHeader(unlinkedUser.userId)
    )

    expect(response.statusCode).to.equal(403)
    const body = /** @type {any} */ (await response.body.json())
    expect(body.message).to.equal('Insufficient scope')
  })
})
