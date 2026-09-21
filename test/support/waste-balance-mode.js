import { expect } from '@playwright/test'
import { getDecemberPrnEligibility } from './seeding/organisation.js'
import { WASTE_BALANCE_POOL } from './waste-balance-pool.js'

/**
 * Whether the create-PRN page shows the December/Non-December pool-split
 * radios for this accreditation right now, asked of the backend rather than
 * inferred from today's date - the declaration window (see
 * december-waste-window.js) can be reconfigured away from calendar December,
 * so a spec that calls this works whichever way the window happens to be set
 * when it runs.
 *
 * Mirrors showsDecemberPool (epr-frontend's december-waste-control.js):
 * `mode` is a fixed property of the accreditation's type, `windowOpen` is
 * time-varying, and the pool-split view needs both.
 *
 * @param {string} refNo
 * @param {string} registrationId
 * @param {string} accreditationId
 * @returns {Promise<boolean>}
 */
export async function showsWasteBalancePoolSplit(
  refNo,
  registrationId,
  accreditationId
) {
  const { mode, windowOpen } = await getDecemberPrnEligibility(
    refNo,
    registrationId,
    accreditationId
  )
  return windowOpen && mode === 'pool'
}

/**
 * Checks the create-PRN page's waste balance display matches whichever shape
 * the December Waste declaration window currently produces for this
 * accreditation, so a smoketest that raises a plain (non-December) PRN
 * passes year-round instead of only outside the window.
 *
 * Reads the pool-split radios (createPRNPage.wasteBalanceOptions /
 * assertWasteBalanceOrder / wasteBalanceTonnage - the same calls the
 * dedicated December pool-choice specs make) when the window is open for a
 * pool-mode accreditation, and the plain banner otherwise.
 *
 * @param {import('page-objects/create.prn.page.js').CreatePRNPage} createPRNPage
 * @param {string} refNo
 * @param {string} registrationId
 * @param {string} accreditationId
 * @param {string} expectedTotal - formatted tonnage, e.g. '40,608.86'
 * @param {string} [noteTypePlural] - 'PRNs' or 'PERNs', matching the banner text
 * @returns {Promise<string | undefined>} the pool a caller should pass as
 *   createPrnDetails' wasteBalancePool to raise from the ordinary balance -
 *   WASTE_BALANCE_POOL.nonDecember when the split is showing, undefined when
 *   it isn't (createPrn already leaves the radios untouched for undefined).
 */
export async function checkWasteBalanceForWindow(
  createPRNPage,
  refNo,
  registrationId,
  accreditationId,
  expectedTotal,
  noteTypePlural = 'PRNs'
) {
  const isSplit = await showsWasteBalancePoolSplit(
    refNo,
    registrationId,
    accreditationId
  )

  if (isSplit) {
    const options = await createPRNPage.wasteBalanceOptions()
    createPRNPage.assertWasteBalanceOrder(options)

    const december = createPRNPage.wasteBalanceTonnage(
      options,
      WASTE_BALANCE_POOL.december
    )
    const general = createPRNPage.wasteBalanceTonnage(
      options,
      WASTE_BALANCE_POOL.nonDecember
    )
    expect(december + general).toBeCloseTo(
      parseFloat(expectedTotal.replace(/,/g, '')),
      2
    )

    return WASTE_BALANCE_POOL.nonDecember
  }

  const wasteBalanceHint = await createPRNPage.wasteBalanceHint()
  expect(wasteBalanceHint).toBe(
    `Your waste balance available for creating ${noteTypePlural} is ${expectedTotal} tonnes.`
  )

  return undefined
}
