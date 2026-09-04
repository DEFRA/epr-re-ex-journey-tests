import { test } from '@playwright/test'
import { thirdTradingName as tradingName } from '../support/fixtures.js'
import { runCreatePrnUnhappyPaths } from '../support/create-prn-unhappy-paths.js'

test.describe('Creating Packing Recycling Notes', () => {
  test('Should test various (Unhappy) paths for Create PRN Reprocessor @createPRN', async ({
    page
  }) => {
    const regNumber = 'R26ER5000000000ST'
    const accNumber = 'A26ER5000000000ST'

    await runCreatePrnUnhappyPaths(page, {
      wasteProcessingType: 'Reprocessor',
      material: 'Steel (R4)',
      materialDesc: 'Steel',
      regNumber,
      accNumber,
      reprocessingType: 'input',
      tradingName,
      process: 'R4',
      // Fixture is named acc_reg (accreditation number first); it seeds a
      // balance well above the 203-tonne draft tonnage, so the within-balance
      // drafts still reach the check page before the over-balance assertion.
      summaryLogFilePath: `resources/sanity/reprocessorInput_${accNumber}_${regNumber}.xlsx`,
      createNewLinkName: 'createNewPRNLink',
      manageLinkName: 'managePRNsLink'
    })
  })
})
