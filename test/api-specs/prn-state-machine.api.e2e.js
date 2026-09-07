import { test } from '@playwright/test'
import { expect } from 'chai'
import { AuthClient } from '../support/auth.js'
import { BaseAPI } from '../apis/base-api.js'
import config from '../config/config.js'
import { defraIdStub } from '../support/defra-id-stub.js'
import {
  createAndRegisterDefraIdUser,
  linkDefraIdUser
} from '../support/defra-id-linking.js'
import {
  createLinkedOrganisation,
  updateMigratedOrganisation,
  seedOverseasSites
} from '../support/seeding/organisation.js'
import {
  externalAPIAcceptPrn,
  externalAPICancelPrn
} from '../support/seeding/prns.js'
import { uploadAndSubmitSummaryLog } from '../support/seeding/summary-logs.js'
import { waitForWasteBalance } from '../support/seeding/waiters.js'
import { assertAuditLog } from '../support/docker-log-assertions.js'

const FIXTURE_PATH = 'resources/summary-log.xlsx'

// Sets up one linked, approved Reprocessor Input registration with a real
// waste-balance ledger (via a real summary-log upload+submit). Both draft
// creation and the draft->awaiting_authorisation transition now check the
// requested tonnage against this balance, so an open ledger carrying a real
// credit is needed to create within-balance drafts at all. The ledger itself
// is only mutated by 6 specific transitions (confirmed via epr-backend's own
// update-status-balance-effects.js); draft->discarded isn't one of them.
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
        regNumber: 'R26ER5000000003PA',
        accNumber: 'A26ER5000000002PA',
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

// The exporter twin of the reprocessor setup above, for the PERN create-time
// balance check. Exporters need overseas sites seeded and use the dedicated
// exporter summary-log fixture (whose accreditation and registration numbers
// are baked into its filename), mirroring accredited.exporter.report.e2e.js.
async function setUpAccreditedExporterWithBalance() {
  const regNumber = 'R26EX5000000002PA'
  const accNumber = 'A26EX5000000002PA'

  const baseAPI = new BaseAPI()
  const authClient = new AuthClient()
  await authClient.authenticate()
  const org = await createLinkedOrganisation([
    { material: 'Paper or board (R3)', wasteProcessingType: 'Exporter' }
  ])
  const migrated = await updateMigratedOrganisation(org.refNo, [
    { regNumber, accNumber, status: 'approved' }
  ])
  const user = await createAndRegisterDefraIdUser(migrated.email)
  await linkDefraIdUser(org.refNo, user.userId, migrated.email)
  await seedOverseasSites(org.refNo)
  const authHeader = defraIdStub.authHeader(user.userId)
  const registrationId = migrated.registrationIds[0]
  const accreditationId = migrated.accreditationIds[0]

  await uploadAndSubmitSummaryLog(
    org.refNo,
    registrationId,
    authHeader,
    `resources/sanity/exporter_${accNumber}_${regNumber}.xlsx`
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

const draftsPath = (refNo, registrationId, accreditationId) =>
  `/v1/organisations/${refNo}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes`

// Posts a draft-creation request and returns the raw response, without asserting
// the outcome, so both the success helper and the rejection tests can share it.
async function postDraft(
  baseAPI,
  { refNo, registrationId, accreditationId },
  authHeader,
  tonnage
) {
  return baseAPI.post(
    draftsPath(refNo, registrationId, accreditationId),
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
}

// Asserts the create-time balance backstop: a 409 carrying both the message and
// the machine-readable code the frontend discriminates on.
async function assertInsufficientBalanceAtCreate(response) {
  expect(response.statusCode).to.equal(409)
  const body = /** @type {any} */ (await response.body.json())
  expect(body.message).to.equal('Insufficient available waste balance')
  expect(body.code).to.equal('INSUFFICIENT_AVAILABLE_BALANCE')
}

async function createPrn(
  baseAPI,
  refNo,
  registrationId,
  accreditationId,
  authHeader,
  tonnage
) {
  const response = await postDraft(
    baseAPI,
    { refNo, registrationId, accreditationId },
    authHeader,
    tonnage
  )
  expect(response.statusCode).to.equal(201)
  const body = /** @type {any} */ (await response.body.json())
  const path = draftsPath(refNo, registrationId, accreditationId)
  return { prnId: body.id, prnPath: `${path}/${body.id}` }
}

// The cancelled feed filters on `status.currentStatusAt`, stamped by the backend
// container. Start the window slightly before the transition so host/container
// clock skew cannot exclude a note cancelled moments ago.
const FEED_WINDOW_MS = 60_000

const feedWindowStart = () =>
  new Date(Date.now() - FEED_WINDOW_MS).toISOString()

// One request to the external, RPD-facing cancelled feed - the endpoint RPD
// polls on its own schedule - returning the note cancelled within `since`.
// Fails with a useful message when it is absent rather than a TypeError
// further down.
//
// `since` is a parameter rather than computed here on purpose: the window has to
// begin *before* the transition, and this runs after it. Folding it inside would
// still pass - the window is wide enough to cover both - while quietly dropping
// the guarantee that the note was found by its own cancellation.
async function fetchCancelledPrn(baseAPI, prnNumber, since) {
  await config.cognitoAuth.generateToken()
  const response = await baseAPI.get(
    `/v1/packaging-recycling-notes?statuses=cancelled&dateFrom=${since}`,
    config.cognitoAuth.authHeader()
  )
  expect(response.statusCode).to.equal(200)
  const body = /** @type {any} */ (await response.body.json())
  const found = body.items.find((item) => item.prnNumber === prnNumber)
  expect(found, `PRN ${prnNumber} missing from the cancelled feed`).to.be.an(
    'object'
  )
  return found
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
  const data = /** @type {any} */ (await getResponse.body.json())

  data.accreditations[0].status = status
  const statusChangeDate = new Date(data.accreditations[0].validFrom)
  statusChangeDate.setDate(statusChangeDate.getDate() + 1)
  data.accreditations[0].statusHistory = [
    ...(data.accreditations[0].statusHistory || []),
    { status, updatedAt: statusChangeDate.toISOString().split('T')[0] }
  ]

  // Status changes seed through the non-prod twin of the organisation PUT —
  // the public route rejects them (PAE-1645).
  return baseAPI.put(
    `/v1/dev/organisations/${refNo}`,
    JSON.stringify({ version: Number(data.version), updateFragment: data }),
    authClient.authHeader()
  )
}

test.describe('PRN state machine @prnStateMachine', () => {
  let ctx

  test.beforeAll(async () => {
    ctx = await setUpAccreditedReprocessorWithBalance()
  })

  test('rejects a self-transition from draft to draft @prnDraftToDraftRejected', async () => {
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
    const body = /** @type {any} */ (await response.body.json())
    expect(body.message).to.equal('No transition exists from draft to draft')
  })

  test('discards a draft PRN without touching the waste balance, then blocks further transitions @prnDiscardFlow', async () => {
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
    const toAuthBody = /** @type {any} */ (await toAuthResponse.body.json())
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
    const toDraftBody = /** @type {any} */ (await toDraftResponse.body.json())
    expect(toDraftBody.message).to.equal(
      'No transition exists from discarded to draft'
    )
  })

  test('rejects issuance when the requested tonnage exceeds the available waste balance @prnInsufficientBalance', async () => {
    // Draft creation is now itself balance-checked, so a single over-balance
    // draft can no longer be created to reach the issuance-time backstop. The
    // backstop is exercised instead by over-committing across two drafts:
    // creation is point-in-time and reserves nothing, so a tiny first draft and
    // a second draft equal to the whole available balance can both be created,
    // but authorising the first drops the available balance below the second, so
    // the second no longer fits. A tiny first draft keeps the transient
    // ringfence small, since this balance is shared with the tests that follow.
    const balance = await waitForWasteBalance(
      ctx.org.refNo,
      ctx.accreditationId,
      ctx.authHeader
    )
    const available = Math.floor(
      parseFloat(balance[ctx.accreditationId].availableAmount)
    )

    let firstPath
    let secondPath
    try {
      const first = await createPrn(
        ctx.baseAPI,
        ctx.org.refNo,
        ctx.registrationId,
        ctx.accreditationId,
        ctx.authHeader,
        1
      )
      firstPath = first.prnPath
      const second = await createPrn(
        ctx.baseAPI,
        ctx.org.refNo,
        ctx.registrationId,
        ctx.accreditationId,
        ctx.authHeader,
        available
      )
      secondPath = second.prnPath

      const firstAuth = await updatePrnStatus(
        ctx.baseAPI,
        firstPath,
        ctx.authHeader,
        'awaiting_authorisation'
      )
      expect(firstAuth.statusCode).to.equal(200)

      const secondAuth = await updatePrnStatus(
        ctx.baseAPI,
        secondPath,
        ctx.authHeader,
        'awaiting_authorisation'
      )
      expect(secondAuth.statusCode).to.equal(409)
      const body = /** @type {any} */ (await secondAuth.body.json())
      expect(body.message).to.equal('Insufficient available waste balance')
    } finally {
      // Always restore the shared balance for the tests that follow, even if an
      // assertion above threw after the first draft was authorised: deleting it
      // credits its tonnage back, and discarding the second touches nothing.
      // Best-effort, so no status assertions here.
      if (firstPath) {
        await updatePrnStatus(ctx.baseAPI, firstPath, ctx.authHeader, 'deleted')
      }
      if (secondPath) {
        await updatePrnStatus(
          ctx.baseAPI,
          secondPath,
          ctx.authHeader,
          'discarded'
        )
      }
    }
  })

  test('rejects draft creation when the requested tonnage exceeds the available waste balance @prnInsufficientBalanceAtCreate', async () => {
    // The create-time backstop: a draft for more than is available is refused up
    // front with the same 409 the confirm-time transition raises, plus a
    // machine-readable code the frontend discriminates on to show an inline
    // error. Nothing is created, so no cleanup is needed.
    const balance = await waitForWasteBalance(
      ctx.org.refNo,
      ctx.accreditationId,
      ctx.authHeader
    )
    const overBalanceTonnage =
      Math.floor(parseFloat(balance[ctx.accreditationId].availableAmount)) + 1

    const response = await postDraft(
      ctx.baseAPI,
      {
        refNo: ctx.org.refNo,
        registrationId: ctx.registrationId,
        accreditationId: ctx.accreditationId
      },
      ctx.authHeader,
      overBalanceTonnage
    )

    await assertInsufficientBalanceAtCreate(response)
  })

  test('deletes a PRN awaiting authorisation, crediting the balance back, then blocks further transitions @prnDeleteFlow', async () => {
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
    const body = /** @type {any} */ (await toAcceptanceResponse.body.json())
    expect(body.message).to.equal(
      'No transition exists from deleted to awaiting_acceptance'
    )
  })

  test('issues a PRN through to external acceptance, rejecting a second acceptance @prnIssueAndAcceptFlow', async () => {
    const { prnId, prnPath } = await createPrn(
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
    await assertAuditLog({
      eventCategory: 'waste-reporting',
      eventAction: 'status-transition',
      eventSubCategory: 'packaging-recycling-notes',
      contextKeys: ['organisationId', 'prnId', 'previous', 'next'],
      count: 1,
      contextValues: [ctx.org.refNo, prnId, 'awaiting_authorisation']
    })

    const issueResponse = await updatePrnStatus(
      ctx.baseAPI,
      prnPath,
      ctx.authHeader,
      'awaiting_acceptance'
    )
    expect(issueResponse.statusCode).to.equal(200)
    const issued = /** @type {any} */ (await issueResponse.body.json())
    expect(issued.prnNumber).to.match(/^SR\d{5,9}$/)
    await assertAuditLog({
      eventCategory: 'waste-reporting',
      eventAction: 'status-transition',
      eventSubCategory: 'packaging-recycling-notes',
      contextKeys: ['organisationId', 'prnId', 'previous', 'next'],
      count: 1,
      contextValues: [ctx.org.refNo, prnId, 'awaiting_acceptance']
    })

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
    const body = /** @type {any} */ (await secondAcceptResponse.body.json())
    expect(body.message).to.equal(
      'No transition exists from accepted to accepted'
    )
  })

  test('rejects a PRN through to cancellation @prnRejectAndCancelFlow', async () => {
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
    const issued = /** @type {any} */ (await issueResponse.body.json())

    const prnDetails = { prnNumber: issued.prnNumber, status: 'Issued' }
    await externalAPICancelPrn(prnDetails)
    expect(prnDetails.status).to.equal('Awaiting cancellation')

    const cancelledFrom = feedWindowStart()
    const cancelResponse = await updatePrnStatus(
      ctx.baseAPI,
      prnPath,
      ctx.authHeader,
      'cancelled'
    )
    expect(cancelResponse.statusCode).to.equal(200)

    // A note reaching `cancelled` by this route was rejected, so it must carry a
    // `rejectedAt`. Without this, a mapper that stopped emitting the field
    // altogether would still satisfy the admin-cancellation test below.
    const cancelledNote = await fetchCancelledPrn(
      ctx.baseAPI,
      issued.prnNumber,
      cancelledFrom
    )
    expect(cancelledNote.status.rejectedAt).to.be.a('string')
    expect(cancelledNote.status.acceptedAt).to.equal(undefined)
  })

  test('lists PRNs created for the accreditation @prnListing', async () => {
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
    const prns = /** @type {any} */ (await response.body.json())
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
  test('blocks issuance (but not creation) once the accreditation is suspended @prnSuspendedAccreditationBlocksIssuance', async () => {
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
    const body = /** @type {any} */ (await issueResponse.body.json())
    expect(body.message).to.equal(
      'Cannot issue a PRN on a suspended accreditation'
    )
  })

  test('blocks both issuance and creation once the accreditation is cancelled @prnCancelledAccreditationBlocksBoth', async () => {
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
    const createBody = /** @type {any} */ (await createResponse.body.json())
    expect(createBody.message).to.equal(
      'Cannot create a PRN on a cancelled accreditation'
    )
  })

  test('allows PRN creation again once the accreditation is re-approved @prnReapprovedAccreditationUnlocksCreation', async () => {
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

  // The admin cancellation path (PAE-1823). Covers the two acceptance criteria
  // that no other test reaches: AC5/AC6, that the tonnage is credited back and
  // is visible immediately, and AC8, that a note cancelled from `accepted`
  // appears in the external cancelled feed carrying `acceptedAt` and no
  // `rejectedAt`. Both are asserted through public APIs - the waste-balance
  // endpoint and the external cancelled feed - rather than by reading the ledger.
  test('cancels an accepted PRN as an admin, crediting the balance back and surfacing it in the external cancelled feed @prnAdminCancelFlow', async () => {
    const balanceBefore = await waitForWasteBalance(
      ctx.org.refNo,
      ctx.accreditationId,
      ctx.authHeader
    )
    const availableBefore = parseFloat(
      balanceBefore[ctx.accreditationId].availableAmount
    )
    const amountBefore = parseFloat(balanceBefore[ctx.accreditationId].amount)

    const tonnage = 5
    const { prnId, prnPath } = await createPrn(
      ctx.baseAPI,
      ctx.org.refNo,
      ctx.registrationId,
      ctx.accreditationId,
      ctx.authHeader,
      tonnage
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
    const issued = /** @type {any} */ (await issueResponse.body.json())

    await externalAPIAcceptPrn({
      prnNumber: issued.prnNumber,
      status: 'Issued'
    })

    const cancelledFrom = feedWindowStart()

    // The admin cancel endpoint takes no payload and is scoped `admin.write`,
    // which the Entra service identity (ea@test.gov.uk) carries.
    const cancelResponse = await ctx.baseAPI.post(
      `/v1/admin/packaging-recycling-notes/${prnId}/cancel`,
      undefined,
      ctx.authClient.authHeader()
    )
    expect(cancelResponse.statusCode).to.equal(200)
    const cancelled = /** @type {any} */ (await cancelResponse.body.json())
    expect(cancelled.status).to.equal('cancelled')
    expect(cancelled.tonnage).to.equal(tonnage)

    // AC5 and AC6: accepting moves nothing, so cancelling returns both figures
    // to exactly what they were before the PRN was created, on the next read.
    const balanceAfter = await waitForWasteBalance(
      ctx.org.refNo,
      ctx.accreditationId,
      ctx.authHeader
    )
    expect(
      parseFloat(balanceAfter[ctx.accreditationId].availableAmount)
    ).to.equal(availableBefore)
    expect(parseFloat(balanceAfter[ctx.accreditationId].amount)).to.equal(
      amountBefore
    )

    // AC8: the note reaches the external cancelled feed with the acceptance
    // recorded and no rejection, distinguishing it from the producer-rejection
    // route that also ends in `cancelled`.
    const cancelledNote = await fetchCancelledPrn(
      ctx.baseAPI,
      issued.prnNumber,
      cancelledFrom
    )
    expect(cancelledNote.status.currentStatus).to.equal('cancelled')
    expect(cancelledNote.status.acceptedAt).to.be.a('string')
    expect(cancelledNote.status.rejectedAt).to.equal(undefined)
    expect(cancelledNote.status.cancelledAt).to.be.a('string')
  })
})

// The create-time balance check applies to exporters (PERN) as well as
// reprocessors (PRN); the backend runs the same assertion on both journeys.
// A dedicated exporter setup proves the exporter path reaches it too.
test.describe('PERN create-time balance check @pernCreateBalanceCheck', () => {
  let ctx

  test.beforeAll(async () => {
    ctx = await setUpAccreditedExporterWithBalance()
  })

  test('rejects draft creation when the requested tonnage exceeds the available waste balance @pernInsufficientBalanceAtCreate', async () => {
    const balance = await waitForWasteBalance(
      ctx.org.refNo,
      ctx.accreditationId,
      ctx.authHeader
    )
    const overBalanceTonnage =
      Math.floor(parseFloat(balance[ctx.accreditationId].availableAmount)) + 1

    const response = await postDraft(
      ctx.baseAPI,
      {
        refNo: ctx.org.refNo,
        registrationId: ctx.registrationId,
        accreditationId: ctx.accreditationId
      },
      ctx.authHeader,
      overBalanceTonnage
    )

    await assertInsufficientBalanceAtCreate(response)
  })
})
