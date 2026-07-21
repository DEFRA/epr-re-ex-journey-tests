import { expect } from 'chai'
import { AuthClient } from '../support/auth.js'
import { BaseAPI } from '../apis/base-api.js'
import config from '../config/config.js'
import { defraIdStub } from '../support/defra-id-stub.js'
import {
  createAndRegisterDefraIdUser,
  createLinkedOrganisation,
  externalAPIAcceptPrn,
  externalAPICancelPrn,
  linkDefraIdUser,
  updateMigratedOrganisation,
  uploadAndSubmitSummaryLog
} from '../support/apicalls.js'

const FIXTURE_PATH = 'resources/summary-log.xlsx'

// Sets up one linked, approved Reprocessor Input registration with a real
// waste-balance ledger (via a real summary-log upload+submit, since PRN
// creation succeeds unconditionally but the draft->awaiting_authorisation
// transition needs an open ledger to check against - confirmed via
// epr-backend's own update-status-balance-effects.js: only 6 specific
// transitions touch the ledger at all, draft->discarded isn't one of them).
async function setUpAccreditedReprocessorWithBalance() {
  const baseAPI = new BaseAPI()
  const authClient = new AuthClient()
  await authClient.authenticate()
  const org = await createLinkedOrganisation([
    { wasteProcessingType: 'Reprocessor' }
  ])
  const migrated = await updateMigratedOrganisation(
    org.refNo,
    [
      {
        reprocessingType: 'input',
        regNumber: 'R25SR500030912PA',
        accNumber: 'ACC123456',
        status: 'approved'
      }
    ],
    'sepa'
  )
  const user = await createAndRegisterDefraIdUser(migrated.email)
  await linkDefraIdUser(org.refNo, user.userId, migrated.email)
  const authHeader = defraIdStub.authHeader(user.userId)
  const registrationId = migrated.registrationIds[0]
  const accreditationId = migrated.accreditationIds[0]

  await uploadAndSubmitSummaryLog(
    org.refNo,
    registrationId,
    authHeader,
    FIXTURE_PATH
  )

  return {
    baseAPI,
    authClient,
    org,
    registrationId,
    accreditationId,
    authHeader
  }
}

async function createPrn(
  baseAPI,
  refNo,
  registrationId,
  accreditationId,
  authHeader,
  tonnage
) {
  const path = `/v1/organisations/${refNo}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes`
  const response = await baseAPI.post(
    path,
    JSON.stringify({
      issuedToOrganisation: {
        id: 'testId',
        name: 'Test Organisation Ltd',
        tradingName: 'Trading Name'
      },
      tonnage
    }),
    authHeader
  )
  expect(response.statusCode).to.equal(201)
  const body = await response.body.json()
  return { prnId: body.id, prnPath: `${path}/${body.id}` }
}

async function updatePrnStatus(baseAPI, prnPath, authHeader, status) {
  return baseAPI.post(
    `${prnPath}/status`,
    JSON.stringify({ status }),
    authHeader
  )
}

// Mirrors organisations.steps.js's "I update the accreditation status to
// {string}" - a raw GET+PUT of the whole org, mutating accreditations[0]
// directly, since there's no dedicated accreditation-status endpoint.
async function updateAccreditationStatus(baseAPI, authClient, refNo, status) {
  const getResponse = await baseAPI.get(
    `/v1/organisations/${refNo}`,
    authClient.authHeader()
  )
  const data = await getResponse.body.json()

  data.accreditations[0].status = status
  const statusChangeDate = new Date(data.accreditations[0].validFrom)
  statusChangeDate.setDate(statusChangeDate.getDate() + 1)
  data.accreditations[0].statusHistory = [
    ...(data.accreditations[0].statusHistory || []),
    { status, updatedAt: statusChangeDate.toISOString().split('T')[0] }
  ]

  return baseAPI.put(
    `/v1/organisations/${refNo}`,
    JSON.stringify({ version: Number(data.version), updateFragment: data }),
    authClient.authHeader()
  )
}

describe('PRN state machine @prnStateMachine', () => {
  let ctx

  before(async () => {
    ctx = await setUpAccreditedReprocessorWithBalance()
  })

  it('rejects a self-transition from draft to draft @prnDraftToDraftRejected', async () => {
    const { prnPath } = await createPrn(
      ctx.baseAPI,
      ctx.org.refNo,
      ctx.registrationId,
      ctx.accreditationId,
      ctx.authHeader,
      10
    )

    const response = await updatePrnStatus(
      ctx.baseAPI,
      prnPath,
      ctx.authHeader,
      'draft'
    )

    expect(response.statusCode).to.equal(400)
    const body = await response.body.json()
    expect(body.message).to.equal('No transition exists from draft to draft')
  })

  it('discards a draft PRN without touching the waste balance, then blocks further transitions @prnDiscardFlow', async () => {
    const { prnPath } = await createPrn(
      ctx.baseAPI,
      ctx.org.refNo,
      ctx.registrationId,
      ctx.accreditationId,
      ctx.authHeader,
      10
    )

    const discardResponse = await updatePrnStatus(
      ctx.baseAPI,
      prnPath,
      ctx.authHeader,
      'discarded'
    )
    expect(discardResponse.statusCode).to.equal(200)

    const toAuthResponse = await updatePrnStatus(
      ctx.baseAPI,
      prnPath,
      ctx.authHeader,
      'awaiting_authorisation'
    )
    expect(toAuthResponse.statusCode).to.equal(400)
    const toAuthBody = await toAuthResponse.body.json()
    expect(toAuthBody.message).to.equal(
      'No transition exists from discarded to awaiting_authorisation'
    )

    const toDraftResponse = await updatePrnStatus(
      ctx.baseAPI,
      prnPath,
      ctx.authHeader,
      'draft'
    )
    expect(toDraftResponse.statusCode).to.equal(400)
    const toDraftBody = await toDraftResponse.body.json()
    expect(toDraftBody.message).to.equal(
      'No transition exists from discarded to draft'
    )
  })

  it('rejects issuance when the requested tonnage exceeds the available waste balance @prnInsufficientBalance', async () => {
    const { prnPath } = await createPrn(
      ctx.baseAPI,
      ctx.org.refNo,
      ctx.registrationId,
      ctx.accreditationId,
      ctx.authHeader,
      1000000
    )

    const response = await updatePrnStatus(
      ctx.baseAPI,
      prnPath,
      ctx.authHeader,
      'awaiting_authorisation'
    )

    expect(response.statusCode).to.equal(409)
    const body = await response.body.json()
    expect(body.message).to.equal('Insufficient available waste balance')
  })

  it('deletes a PRN awaiting authorisation, crediting the balance back, then blocks further transitions @prnDeleteFlow', async () => {
    const { prnPath } = await createPrn(
      ctx.baseAPI,
      ctx.org.refNo,
      ctx.registrationId,
      ctx.accreditationId,
      ctx.authHeader,
      5
    )

    const authResponse = await updatePrnStatus(
      ctx.baseAPI,
      prnPath,
      ctx.authHeader,
      'awaiting_authorisation'
    )
    expect(authResponse.statusCode).to.equal(200)

    const deleteResponse = await updatePrnStatus(
      ctx.baseAPI,
      prnPath,
      ctx.authHeader,
      'deleted'
    )
    expect(deleteResponse.statusCode).to.equal(200)

    const toAcceptanceResponse = await updatePrnStatus(
      ctx.baseAPI,
      prnPath,
      ctx.authHeader,
      'awaiting_acceptance'
    )
    expect(toAcceptanceResponse.statusCode).to.equal(400)
    const body = await toAcceptanceResponse.body.json()
    expect(body.message).to.equal(
      'No transition exists from deleted to awaiting_acceptance'
    )
  })

  it('issues a PRN through to external acceptance, rejecting a second acceptance @prnIssueAndAcceptFlow', async () => {
    const { prnPath } = await createPrn(
      ctx.baseAPI,
      ctx.org.refNo,
      ctx.registrationId,
      ctx.accreditationId,
      ctx.authHeader,
      5
    )

    const authResponse = await updatePrnStatus(
      ctx.baseAPI,
      prnPath,
      ctx.authHeader,
      'awaiting_authorisation'
    )
    expect(authResponse.statusCode).to.equal(200)

    const issueResponse = await updatePrnStatus(
      ctx.baseAPI,
      prnPath,
      ctx.authHeader,
      'awaiting_acceptance'
    )
    expect(issueResponse.statusCode).to.equal(200)
    const issued = await issueResponse.body.json()
    expect(issued.prnNumber).to.match(/^SR\d{5,9}$/)

    const prnDetails = { prnNumber: issued.prnNumber, status: 'Issued' }
    await externalAPIAcceptPrn(prnDetails)
    expect(prnDetails.status).to.equal('Accepted')

    // externalAPIAcceptPrn asserts success internally, so it can't be reused
    // for the expected-to-fail second call - hit the endpoint directly with
    // the same cognito auth instead.
    await config.cognitoAuth.generateToken()
    const secondAcceptResponse = await ctx.baseAPI.post(
      `/v1/packaging-recycling-notes/${issued.prnNumber}/accept`,
      JSON.stringify({ acceptedAt: new Date().toISOString() }),
      config.cognitoAuth.authHeader()
    )
    expect(secondAcceptResponse.statusCode).to.equal(409)
    const body = await secondAcceptResponse.body.json()
    expect(body.message).to.equal(
      'No transition exists from accepted to accepted'
    )
  })

  it('rejects a PRN through to cancellation @prnRejectAndCancelFlow', async () => {
    const { prnPath } = await createPrn(
      ctx.baseAPI,
      ctx.org.refNo,
      ctx.registrationId,
      ctx.accreditationId,
      ctx.authHeader,
      5
    )

    await updatePrnStatus(
      ctx.baseAPI,
      prnPath,
      ctx.authHeader,
      'awaiting_authorisation'
    )
    const issueResponse = await updatePrnStatus(
      ctx.baseAPI,
      prnPath,
      ctx.authHeader,
      'awaiting_acceptance'
    )
    const issued = await issueResponse.body.json()

    const prnDetails = { prnNumber: issued.prnNumber, status: 'Issued' }
    await externalAPICancelPrn(prnDetails)
    expect(prnDetails.status).to.equal('Awaiting cancellation')

    const cancelResponse = await updatePrnStatus(
      ctx.baseAPI,
      prnPath,
      ctx.authHeader,
      'cancelled'
    )
    expect(cancelResponse.statusCode).to.equal(200)
  })

  it('lists PRNs created for the accreditation @prnListing', async () => {
    await createPrn(
      ctx.baseAPI,
      ctx.org.refNo,
      ctx.registrationId,
      ctx.accreditationId,
      ctx.authHeader,
      5
    )

    const response = await ctx.baseAPI.get(
      `/v1/organisations/${ctx.org.refNo}/registrations/${ctx.registrationId}/accreditations/${ctx.accreditationId}/packaging-recycling-notes`,
      ctx.authHeader
    )

    expect(response.statusCode).to.equal(200)
    const prns = await response.body.json()
    expect(prns.length).to.be.greaterThan(0)
    expect(
      prns.every((prn) => prn.issuedToOrganisation.id === 'testId')
    ).to.equal(true)
  })

  // These 3 tests permanently mutate the shared accreditation's own status
  // (suspended -> cancelled -> approved) and must run last, in this order -
  // mocha preserves declaration order within a describe block, so this is
  // safe as long as nothing above depends on the accreditation still being
  // plain 'approved'.
  it('blocks issuance (but not creation) once the accreditation is suspended @prnSuspendedAccreditationBlocksIssuance', async () => {
    const suspendResponse = await updateAccreditationStatus(
      ctx.baseAPI,
      ctx.authClient,
      ctx.org.refNo,
      'suspended'
    )
    expect(suspendResponse.statusCode).to.equal(200)

    const { prnPath } = await createPrn(
      ctx.baseAPI,
      ctx.org.refNo,
      ctx.registrationId,
      ctx.accreditationId,
      ctx.authHeader,
      5
    )

    const authResponse = await updatePrnStatus(
      ctx.baseAPI,
      prnPath,
      ctx.authHeader,
      'awaiting_authorisation'
    )
    expect(authResponse.statusCode).to.equal(200)

    const issueResponse = await updatePrnStatus(
      ctx.baseAPI,
      prnPath,
      ctx.authHeader,
      'awaiting_acceptance'
    )
    expect(issueResponse.statusCode).to.equal(403)
    const body = await issueResponse.body.json()
    expect(body.message).to.equal(
      'Cannot issue a PRN on a suspended accreditation'
    )
  })

  it('blocks both issuance and creation once the accreditation is cancelled @prnCancelledAccreditationBlocksBoth', async () => {
    const cancelResponse = await updateAccreditationStatus(
      ctx.baseAPI,
      ctx.authClient,
      ctx.org.refNo,
      'cancelled'
    )
    expect(cancelResponse.statusCode).to.equal(200)

    const createResponse = await ctx.baseAPI.post(
      `/v1/organisations/${ctx.org.refNo}/registrations/${ctx.registrationId}/accreditations/${ctx.accreditationId}/packaging-recycling-notes`,
      JSON.stringify({
        issuedToOrganisation: {
          id: 'testId',
          name: 'Test Organisation Ltd',
          tradingName: 'Trading Name'
        },
        tonnage: 5
      }),
      ctx.authHeader
    )
    expect(createResponse.statusCode).to.equal(403)
    const createBody = await createResponse.body.json()
    expect(createBody.message).to.equal(
      'Cannot create a PRN on a cancelled accreditation'
    )
  })

  it('allows PRN creation again once the accreditation is re-approved @prnReapprovedAccreditationUnlocksCreation', async () => {
    const approveResponse = await updateAccreditationStatus(
      ctx.baseAPI,
      ctx.authClient,
      ctx.org.refNo,
      'approved'
    )
    expect(approveResponse.statusCode).to.equal(200)

    const { prnPath } = await createPrn(
      ctx.baseAPI,
      ctx.org.refNo,
      ctx.registrationId,
      ctx.accreditationId,
      ctx.authHeader,
      5
    )
    expect(prnPath).to.be.a('string')
  })
})
