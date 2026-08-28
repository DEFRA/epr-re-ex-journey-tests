import { randomUUID } from 'crypto'
import { expect } from 'chai'
import { BaseAPI } from '../apis/base-api.js'
import { defraIdStub } from './defra-id-stub.js'
import Users from './users.js'
import { assertSuccessResponse } from './response-assertions.js'

// Entra tokens go through the shared AuthClient (see auth.js). Defra ID user
// tokens all go through the shared defraIdStub, which connects via
// config.defraIdUri - the local compose hostname or the deployed
// environment's stub URL, depending on ENVIRONMENT. Connecting directly
// (rather than hitting localhost with a spoofed Host header) is what makes
// the stub embed the right JWT issuer for whichever backend is under test.

// Registers a throwaway user with the Defra ID stub and returns a Bearer token
// with standardUser scope for the given defraOrgId.
export async function getDefraUserToken(email, orgId = randomUUID()) {
  const userId = randomUUID()
  const clientId = '63983fc2-cfff-45bb-8ec2-959e21062b9a'

  await defraIdStub.register(
    JSON.stringify({
      userId,
      email,
      firstName: 'Test',
      lastName: 'User',
      loa: '1',
      aal: '1',
      enrolmentCount: 1,
      enrolmentRequestCount: 1
    })
  )

  const relParams = new URLSearchParams({
    csrfToken: randomUUID(),
    userId,
    relationshipId: 'relId1',
    organisationId: orgId,
    organisationName: 'Test Organisation',
    relationshipRole: 'role',
    roleName: 'User',
    roleStatus: 'Status',
    // eslint-disable-next-line camelcase
    redirect_uri: 'http://localhost:3000/'
  })
  await defraIdStub.addRelationship(relParams.toString(), userId)

  const authParams = {
    user: email,
    // eslint-disable-next-line camelcase
    client_id: clientId,
    // eslint-disable-next-line camelcase
    response_type: 'code',
    // eslint-disable-next-line camelcase
    redirect_uri: 'http://0.0.0.0:3001/health',
    state: 'state',
    scope: 'email'
  }
  const locationHeader = await defraIdStub.authorise(authParams)
  const sessionId = locationHeader.split('sessionId=')[1]

  const tokenData = await defraIdStub.generateToken(
    JSON.stringify({
      // eslint-disable-next-line camelcase
      client_id: clientId,
      // eslint-disable-next-line camelcase
      client_secret: 'test_value',
      // eslint-disable-next-line camelcase
      grant_type: 'authorization_code',
      code: sessionId
    }),
    userId
  )
  return tokenData.access_token
}

export async function createAndRegisterDefraIdUser(email) {
  const users = new Users()
  const user = await users.userPayload(email)
  await defraIdStub.register(JSON.stringify(user))

  return user
}

export async function linkDefraIdUser(organisationId, userId, email) {
  const baseAPI = new BaseAPI()
  const users = new Users()

  const payload = await users.authorisationPayload(email)
  const response = await defraIdStub.authorise(payload)
  if (!response) {
    throw new Error(
      `DefraID stub authorise returned no location header for ${email}`
    )
  }
  const sessionId = response.split('sessionId=')[1]

  const tokenPayload = await users.tokenPayload(sessionId)
  await defraIdStub.generateToken(JSON.stringify(tokenPayload), userId)

  const linkResponse = await baseAPI.post(
    `/v1/organisations/${organisationId}/link`,
    '',
    defraIdStub.authHeader(userId)
  )

  expect(linkResponse.statusCode).to.equal(200)
}

/**
 * Registers a Defra ID user for the given email and links them to the
 * organisation. Returns the user so callers that need user.userId for
 * further seeding (e.g. seedSubmittedReport) before logging in still can.
 * @param {string} organisationRefNo
 * @param {string} email
 */
export async function registerAndLinkDefraIdUser(organisationRefNo, email) {
  const user = await createAndRegisterDefraIdUser(email)
  await linkDefraIdUser(organisationRefNo, user.userId, email)
  return user
}

export async function linkOrganisationToDefraId(refNo, email) {
  const baseAPI = new BaseAPI()

  const orgId = randomUUID()
  const defraToken = await getDefraUserToken(email, orgId)
  const defraAuthHeader = { Authorization: `Bearer ${defraToken}` }

  const linkResponse = await baseAPI.post(
    `/v1/organisations/${refNo}/link`,
    '',
    defraAuthHeader
  )

  await assertSuccessResponse(
    linkResponse,
    `POST /v1/organisations/${refNo}/link`
  )
  return { defraOrgId: orgId, defraOrgName: 'Test Organisation' }
}
