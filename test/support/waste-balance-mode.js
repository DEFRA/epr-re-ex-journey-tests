import { expect } from '@playwright/test'
import { WASTE_BALANCE_POOL } from './waste-balance-pool.js'

/**
 * Checks the create-PRN page's waste balance display matches whichever shape
 * the December Waste declaration window currently produces for this
 * accreditation, so a smoketest that raises a plain (non-December) PRN
 * passes year-round instead of only outside the window.
 *
 * Reads the pool-split radios (createPRNPage.wasteBalanceOptions /
 * assertWasteBalanceOrder / wasteBalanceTonnage - the same calls the
 * dedicated December pool-choice specs make) when the split shows, and the
 * plain banner otherwise.
 *
 * @param {import('page-objects/create.prn.page.js').CreatePRNPage} createPRNPage
 * @param {boolean} isSplit - whether the page shows the pool split: the window
 *   is open and the accreditation chooses between pools
 * @param {string} expectedTotal - formatted tonnage, e.g. '40,608.86'
 * @param {string} [noteTypePlural] - 'PRNs' or 'PERNs', matching the banner text
 * @returns {Promise<string | undefined>} the pool a caller should pass as
 *   createPrnDetails' wasteBalancePool to raise from the ordinary balance -
 *   WASTE_BALANCE_POOL.nonDecember when the split is showing, undefined when
 *   it isn't (createPrn already leaves the radios untouched for undefined).
 */
export async function checkWasteBalanceForWindow(
  createPRNPage,
  isSplit,
  expectedTotal,
  noteTypePlural = 'PRNs'
) {
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
