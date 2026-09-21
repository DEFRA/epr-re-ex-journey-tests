import { test } from '@playwright/test'
import { runDeleteCreatedPrn } from '../support/delete-created-prn.js'
import { generateSummaryLogContent } from '../support/spreadsheet/summarylogs-content-generator.js'

const reprocessedRowFields = (rowId) => ({
  rowId,
  fields: {
    PRODUCT_TONNAGE: 500,
    UK_PACKAGING_WEIGHT_PERCENTAGE: 1,
    PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION: 500,
    ADD_PRODUCT_WEIGHT: 'Yes'
  }
})

test.describe('Deleting Packing Recycling Notes (Reprocessor Output)', () => {
  test('Should be able to create and delete PRN for Plastic (Reprocessor Output) @delPRNOutput', async ({
    page
  }) => {
    const regNumber = 'R26ER5000000001PL'
    const accNumber = 'A26ER5000000001PL'

    const summaryLogContent = await generateSummaryLogContent({
      wasteProcessingType: 'reprocessorOutput',
      materialSuffix: 'PL',
      regNumber,
      accNumber,
      rows: {
        'Reprocessed (sections 3 and 4)': [
          reprocessedRowFields(9001),
          reprocessedRowFields(9002)
        ]
      }
    })

    await runDeleteCreatedPrn(page, {
      wasteProcessingType: 'Reprocessor',
      material: 'Plastic (R3)',
      regNumber,
      accNumber,
      reprocessingType: 'output',
      summaryLogContent,
      expectedWasteBalance: '1,000.00',
      expectedDeductedWasteBalance: '797.00',
      createNewLinkName: 'createNewPRNLink',
      manageLinkName: 'managePRNsLink'
    })
  })
})
