import { test } from '@playwright/test'
import { runDeleteCreatedPrn } from '../support/delete-created-prn.js'

test.describe('Deleting Packing Recycling Notes (Reprocessor Output)', () => {
  test('Should be able to create and delete PRN for Plastic (Reprocessor Output) @delPRNOutput', async ({
    page
  }) => {
    const regNumber = 'R26ER5000000001PL'
    const accNumber = 'A26ER5000000001PL'

    await runDeleteCreatedPrn(page, {
      wasteProcessingType: 'Reprocessor',
      material: 'Plastic (R3)',
      regNumber,
      accNumber,
      reprocessingType: 'output',
      summaryLogFilePath: `resources/sanity/reprocessorOutput_${accNumber}_${regNumber}.xlsx`,
      expectedWasteBalance: '56,455.67 tonnes',
      expectedDeductedWasteBalance: '56,252.67 tonnes',
      createNewLinkName: 'createNewPRNLink',
      manageLinkName: 'managePRNsLink'
    })
  })
})
