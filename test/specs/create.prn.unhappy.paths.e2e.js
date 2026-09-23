import { test } from '@playwright/test'
import { thirdTradingName as tradingName } from '../support/fixtures.js'
import { runCreatePrnUnhappyPaths } from '../support/create-prn-unhappy-paths.js'
import { generateSummaryLogContent } from '../support/spreadsheet/summarylogs-content-generator.js'

test.describe('Creating Packing Recycling Notes', () => {
  test('Should test various (Unhappy) paths for Create PRN Reprocessor @createPRN', async ({
    page
  }) => {
    const regNumber = 'R26ER5000000000ST'
    const accNumber = 'A26ER5000000000ST'

    const summaryLogContent = await generateSummaryLogContent({
      wasteProcessingType: 'reprocessorInput',
      materialSuffix: 'ST',
      regNumber,
      accNumber,
      rows: {
        'Received (sections 1, 2 and 3)': [
          {
            rowId: 9001,
            fields: {
              WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE: 'No',
              GROSS_WEIGHT: 650,
              TARE_WEIGHT: 100,
              PALLET_WEIGHT: 50,
              WEIGHT_OF_NON_TARGET_MATERIALS: 0,
              RECYCLABLE_PROPORTION_PERCENTAGE: 1,
              BAILING_WIRE_PROTOCOL: 'No'
            }
          }
        ]
      }
    })

    await runCreatePrnUnhappyPaths(page, {
      wasteProcessingType: 'Reprocessor',
      material: 'Steel (R4)',
      materialDesc: 'Steel',
      regNumber,
      accNumber,
      reprocessingType: 'input',
      process: 'R4',
      summaryLogContent,
      tradingName,
      createNewLinkName: 'createNewPRNLink',
      manageLinkName: 'managePRNsLink'
    })
  })
})
