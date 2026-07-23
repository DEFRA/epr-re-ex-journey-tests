import { test } from '@playwright/test'
import { thirdTradingName as tradingName } from '../support/fixtures.js'
import { runCreatePrnUnhappyPaths } from '../support/create-prn-unhappy-paths.js'

test.describe('Creating Packing Recycling Notes', () => {
  test('Should test various (Unhappy) paths for Create PRN Reprocessor @createprn', async ({
    page
  }) => {
    await runCreatePrnUnhappyPaths(page, {
      wasteProcessingType: 'Reprocessor',
      material: 'Paper or board (R3)',
      materialDesc: 'Paper and board',
      regNumber: 'R25SR500000912PA',
      accNumber: 'R-ACC12045PA',
      reprocessingType: 'input',
      tradingName,
      createNewLinkName: 'createNewPRNLink',
      manageLinkName: 'managePRNsLink'
    })
  })
})
