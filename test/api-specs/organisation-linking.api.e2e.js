import { expect } from 'chai'
import { AuthClient } from '../support/auth.js'
import { BaseAPI } from '../apis/base-api.js'
import { defraIdStub } from '../support/defra-id-stub.js'
import Users from '../support/users.js'
import {
  createAndRegisterDefraIdUser,
  createLinkedOrganisation,
  linkDefraIdUser,
  updateMigratedOrganisation
} from '../support/apicalls.js'

async function setUpApprovedReprocessor() {
  const org = await createLinkedOrganisation([
    { wasteProcessingType: 'Reprocessor' }
  ])
  const migrated = await updateMigratedOrganisation(org.refNo, [
    {
      reprocessingType: 'input',
      regNumber: 'R25SR500030912PA',
      accNumber: 'ACC123456',
      status: 'approved'
    }
  ])
  return { org, migrated }
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

describe('Organisation linking/unlinking negative paths @organisationLinking', () => {
  const baseAPI = new BaseAPI()
  const authClient = new AuthClient()

  before(async () => {
    await authClient.authenticate()
  })

  it('rejects linking when the registration is not yet approved @orgLinkNotLinkable', async () => {
    const org = await createLinkedOrganisation([
      { wasteProcessingType: 'Reprocessor' }
    ])
    const migrated = await updateMigratedOrganisation(org.refNo, [
      {
        reprocessingType: 'input',
        regNumber: 'R25SR500030912PA',
        accNumber: 'ACC123456',
        status: 'created'
      }
    ])
    const user = await registerAuthorisedUser(migrated.email)

    const response = await baseAPI.post(
      `/v1/organisations/${org.refNo}/link`,
      '',
      defraIdStub.authHeader(user.userId)
    )

    expect(response.statusCode).to.equal(409)
    const body = /** @type {any} */ (await response.body.json())
    expect(body.message).to.equal('Organisation is not in a linkable state')
  })

  it('allows re-linking after unlinking @orgLinkRelinkAfterUnlink', async () => {
    const { org, migrated } = await setUpApprovedReprocessor()
    const user = await createAndRegisterDefraIdUser(migrated.email)
    await linkDefraIdUser(org.refNo, user.userId, migrated.email)

    const unlinkResponse = await baseAPI.delete(
      `/v1/organisations/${org.refNo}/link`,
      authClient.authHeader()
    )
    expect(unlinkResponse.statusCode).to.equal(204)

    const relinkResponse = await baseAPI.post(
      `/v1/organisations/${org.refNo}/link`,
      '',
      defraIdStub.authHeader(user.userId)
    )
    expect(relinkResponse.statusCode).to.equal(200)
  })

  it('rejects unlinking an organisation that is not linked @orgUnlinkNotLinked', async () => {
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

  it('rejects a different user attempting to link an already-linked organisation @orgLinkDifferentUserRejected', async () => {
    const { org, migrated } = await setUpApprovedReprocessor()
    const firstUser = await createAndRegisterDefraIdUser(migrated.email)
    await linkDefraIdUser(org.refNo, firstUser.userId, migrated.email)

    const secondUser = await registerAuthorisedUser('test123456@testuserz.com')
    const response = await baseAPI.post(
      `/v1/organisations/${org.refNo}/link`,
      '',
      defraIdStub.authHeader(secondUser.userId)
    )

    expect(response.statusCode).to.equal(409)
    const body = /** @type {any} */ (await response.body.json())
    expect(body.message).to.equal('Organisation is not in a linkable state')
  })

  it('rejects re-linking the same user to an already-linked organisation @orgLinkAlreadyLinkedRejected', async () => {
    const { org, migrated } = await setUpApprovedReprocessor()
    const user = await createAndRegisterDefraIdUser(migrated.email)
    await linkDefraIdUser(org.refNo, user.userId, migrated.email)

    const response = await baseAPI.post(
      `/v1/organisations/${org.refNo}/link`,
      '',
      defraIdStub.authHeader(user.userId)
    )

    expect(response.statusCode).to.equal(409)
    const body = /** @type {any} */ (await response.body.json())
    expect(body.message).to.equal('Organisation is not in a linkable state')
  })

  it('rejects a linked user accessing another organisation @orgCrossOrganisationAccessRejected', async () => {
    const { org, migrated } = await setUpApprovedReprocessor()
    const user = await createAndRegisterDefraIdUser(migrated.email)
    await linkDefraIdUser(org.refNo, user.userId, migrated.email)

    const otherOrgId = '6507f1f77bcf86cd79943999'
    const response = await baseAPI.post(
      `/v1/organisations/${otherOrgId}/registrations/${migrated.registrationIds[0]}/summary-logs`,
      JSON.stringify({ redirectUrl: 'test-redirect' }),
      defraIdStub.authHeader(user.userId)
    )

    expect(response.statusCode).to.equal(403)
    const body = /** @type {any} */ (await response.body.json())
    expect(body.message).to.equal('Insufficient scope')
  })

  it('rejects an unlinked user accessing a recently linked organisation @orgUnlinkedUserAccessRejected', async () => {
    const { org, migrated } = await setUpApprovedReprocessor()
    const linkedUser = await createAndRegisterDefraIdUser(migrated.email)
    await linkDefraIdUser(org.refNo, linkedUser.userId, migrated.email)

    const unlinkedUser = await registerAuthorisedUser(
      'anothertest123456@testuserz.com'
    )
    const response = await baseAPI.post(
      `/v1/organisations/${org.refNo}/registrations/${migrated.registrationIds[0]}/summary-logs`,
      JSON.stringify({ redirectUrl: 'test-redirect' }),
      defraIdStub.authHeader(unlinkedUser.userId)
    )

    expect(response.statusCode).to.equal(403)
    const body = /** @type {any} */ (await response.body.json())
    expect(body.message).to.equal('Insufficient scope')
  })
})
