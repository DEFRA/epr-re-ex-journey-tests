import { test, expect } from '@playwright/test'
import { PRNViewPage } from 'page-objects/prn.view.page.js'
import { BaseAPI } from '../apis/base-api.js'
import { AuthClient } from '../support/auth.js'
import { checkBodyText } from '../support/checks.js'
import { loginViaHomePage } from '../support/login-helper.js'
import config from '../config/config.js'
import { seedAccreditedOutputReprocessor } from '../support/seeding/output-reprocessor.js'
import {
  createPrn,
  externalAPIAcceptPrn,
  updatePrnStatus
} from '../support/seeding/prns.js'
import { registrationStartYear } from '../support/seeding/summary-logs.js'

// PAE-1991. @decWaste: December PRNs can only be created in the December
// window, which only the December CI leg opens. The obligation year rule never
// reads the clock, so no time travel is needed: Y is the seeded year.
// Environment config never fails a test here: a shut window or a disabled
// admin cancel route skips the tests that need it, with the reason.

// Starts feed windows early so container clock skew can't hide the note.
const FEED_WINDOW_MS = 60_000

const baseAPI = new BaseAPI()

const feedWindowStart = () =>
  new Date(Date.now() - FEED_WINDOW_MS).toISOString()

const objectIdAt = (isoDate) =>
  Math.floor(new Date(isoDate).getTime() / 1000)
    .toString(16)
    .padStart(8, '0') + '0'.repeat(16)

async function rpdAuthHeader() {
  await config.cognitoAuth.generateToken()
  return config.cognitoAuth.authHeader()
}

async function readBody(response) {
  const text = await response.body.text()
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

async function findInRpdFeed(prnNumber, status, since) {
  const auth = await rpdAuthHeader()
  let cursor
  do {
    const query = new URLSearchParams({ statuses: status, dateFrom: since })
    if (cursor) {
      query.set('cursor', cursor)
    }
    const response = await baseAPI.get(
      `/v1/packaging-recycling-notes?${query}`,
      auth
    )
    expect(response.statusCode).toBe(200)
    const body = /** @type {any} */ (await response.body.json())
    const found = body.items.find((item) => item.prnNumber === prnNumber)
    if (found) {
      return found
    }
    cursor = body.nextCursor
  } while (cursor)
  throw new Error(`${prnNumber} not found in RPD's ${status} feed`)
}

test.describe('Accepting a PRN into an obligation year (RPD) @decWaste @prnObligationYear', () => {
  const accreditationYear = registrationStartYear()
  let ctx

  // The stored document, as RPD's feed reads it. The by-id and natural-key
  // routes replay the ledger on read, so they would hide a document the accept
  // failed to update. The list pages by _id, so the cursor starts at an id
  // minted when the PRN was created, skipping every older PRN.
  async function findStored(prnNumber, status, createdFrom) {
    let cursor = objectIdAt(createdFrom)
    do {
      const query = new URLSearchParams({
        statuses: status,
        limit: '1000',
        cursor
      })
      const response = await baseAPI.get(
        `/v1/admin/packaging-recycling-notes?${query}`,
        ctx.authClient.authHeader()
      )
      expect(response.statusCode).toBe(200)
      const body = /** @type {any} */ (await response.body.json())
      const found = body.items.find((item) => item.prnNumber === prnNumber)
      if (found) {
        return found
      }
      cursor = body.hasMore ? body.nextCursor : undefined
    } while (cursor)
    throw new Error(`${prnNumber} not found among ${status} PRNs`)
  }

  // Skips a December PRN's test when the window is shut on this environment.
  async function issuePrnOrSkip(isDecemberWaste) {
    test.skip(
      isDecemberWaste && !ctx.windowOpen,
      'December Waste window is shut on this environment; needs a December PRN'
    )
    const issuedFrom = feedWindowStart()
    const { prnId, prnPath } = await createPrn(
      ctx.refNo,
      ctx.registrationId,
      ctx.accreditationId,
      ctx.authHeader,
      1,
      { isDecemberWaste }
    )
    await updatePrnStatus(prnPath, ctx.authHeader, 'awaiting_authorisation')
    const { prnNumber } = await updatePrnStatus(
      prnPath,
      ctx.authHeader,
      'awaiting_acceptance'
    )

    const awaiting = await findInRpdFeed(
      prnNumber,
      'awaiting_acceptance',
      issuedFrom
    )
    expect(awaiting.isDecemberWaste).toBe(isDecemberWaste)
    expect(awaiting.accreditation.accreditationYear).toBe(accreditationYear)
    expect(awaiting.obligationYear).toBe(accreditationYear)

    return { prnId, prnNumber, issuedFrom }
  }

  test.beforeAll(async () => {
    const authClient = new AuthClient()
    await authClient.authenticate()
    ctx = { authClient, ...(await seedAccreditedOutputReprocessor()) }
  })

  test('keeps a December PRN in its accreditation year when RPD accepts it there (AC1) @prnObligationYearDecSame', async () => {
    const { prnNumber, issuedFrom } = await issuePrnOrSkip(true)

    await externalAPIAcceptPrn(
      { prnNumber },
      { obligationYear: accreditationYear }
    )

    const stored = await findStored(prnNumber, 'accepted', issuedFrom)
    expect(stored.isDecemberWaste).toBe(true)
    expect(stored.accreditationYear).toBe(accreditationYear)
    expect(stored.obligationYear).toBe(accreditationYear)
  })

  test("moves a December PRN to the following obligation year when RPD accepts it into Y+1, and the operator's PRN page says so (AC2) @prnObligationYearDecNext", async ({
    page
  }) => {
    const { prnId, prnNumber, issuedFrom } = await issuePrnOrSkip(true)

    await externalAPIAcceptPrn(
      { prnNumber },
      { obligationYear: accreditationYear + 1 }
    )

    const stored = await findStored(prnNumber, 'accepted', issuedFrom)
    expect(stored.isDecemberWaste).toBe(true)
    expect(stored.accreditationYear).toBe(accreditationYear)
    expect(stored.obligationYear).toBe(accreditationYear + 1)

    await loginViaHomePage(page, ctx.email)
    const prnViewPage = new PRNViewPage(page)
    await prnViewPage.open(
      ctx.orgId,
      ctx.registrationNumber,
      accreditationYear,
      prnId
    )
    await checkBodyText(
      page,
      `in ${accreditationYear} and can count towards ${accreditationYear + 1} obligations`,
      10
    )
  })

  test('keeps an ordinary PRN in its accreditation year when RPD sends no year (AC3) @prnObligationYearOrdinary', async () => {
    const { prnNumber, issuedFrom } = await issuePrnOrSkip(false)

    await externalAPIAcceptPrn({ prnNumber })

    const stored = await findStored(prnNumber, 'accepted', issuedFrom)
    expect(stored.isDecemberWaste).toBe(false)
    expect(stored.accreditationYear).toBe(accreditationYear)
    expect(stored.obligationYear).toBe(accreditationYear)
  })

  test('refuses a December PRN into Y+2, leaving it for RPD to accept into Y+1 @prnObligationYearDecOutOfRange', async () => {
    const { prnNumber, issuedFrom } = await issuePrnOrSkip(true)

    // Direct: externalAPIAcceptPrn asserts success.
    const refused = await baseAPI.post(
      `/v1/packaging-recycling-notes/${prnNumber}/accept`,
      JSON.stringify({
        acceptedAt: new Date().toISOString(),
        obligationYear: accreditationYear + 2
      }),
      await rpdAuthHeader()
    )
    expect(refused.statusCode).toBe(400)
    const body = await readBody(refused)
    expect(body.message).toContain(
      `obligationYear must be either accreditation year ${accreditationYear} or ${accreditationYear + 1}`
    )

    const stillAwaiting = await findInRpdFeed(
      prnNumber,
      'awaiting_acceptance',
      issuedFrom
    )
    expect(stillAwaiting.obligationYear).toBe(accreditationYear)

    await externalAPIAcceptPrn(
      { prnNumber },
      { obligationYear: accreditationYear + 1 }
    )

    const stored = await findStored(prnNumber, 'accepted', issuedFrom)
    expect(stored.obligationYear).toBe(accreditationYear + 1)
  })

  test('tells RPD the Y+1 obligation year when a December PRN accepted into it is cancelled @prnObligationYearDecCancelled', async () => {
    const { prnId, prnNumber } = await issuePrnOrSkip(true)
    await externalAPIAcceptPrn(
      { prnNumber },
      { obligationYear: accreditationYear + 1 }
    )

    const cancelledFrom = feedWindowStart()
    const cancel = await baseAPI.post(
      `/v1/admin/packaging-recycling-notes/${prnId}/cancel`,
      undefined,
      ctx.authClient.authHeader()
    )
    // An unregistered route answers "Not Found"; the handler's own 404 names
    // the PRN, so a lookup bug still fails.
    const cancelBody = await readBody(cancel)
    test.skip(
      cancel.statusCode === 404 && cancelBody?.message === 'Not Found',
      'Admin PRN cancellation is not enabled on this environment'
    )
    expect(cancel.statusCode).toBe(200)

    // RPD reverses the cancellation against this year.
    const cancelled = await findInRpdFeed(prnNumber, 'cancelled', cancelledFrom)
    expect(cancelled.status.currentStatus).toBe('cancelled')
    expect(cancelled.status.acceptedAt).toEqual(expect.any(String))
    expect(cancelled.isDecemberWaste).toBe(true)
    expect(cancelled.accreditation.accreditationYear).toBe(accreditationYear)
    expect(cancelled.obligationYear).toBe(accreditationYear + 1)
  })
})
