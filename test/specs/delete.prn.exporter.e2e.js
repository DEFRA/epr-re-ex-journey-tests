import { test } from '@playwright/test'
import { runDeleteCreatedPrn } from '../support/delete-created-prn.js'
import { generateSummaryLogContent } from '../support/spreadsheet/summarylogs-content-generator.js'

const exportedRowFields = (rowId) => ({
  rowId,
  fields: {
    WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE: 'No',
    DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE: 'No',
    WAS_THE_WASTE_REFUSED: 'No',
    WAS_THE_WASTE_STOPPED: 'No',
    OSR_ID: 100,
    TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 500
  }
})

test.describe('Deleting Packing Recycling Notes (Exporter)', () => {
  test('Should be able to create and delete PRN for Fibre (Exporter) @delPRNExp', async ({
    page
  }) => {
    const regNumber = 'R26EX5000000002FB'
    const accNumber = 'A26EX5000000002FB'

    const summaryLogContent = await generateSummaryLogContent({
      wasteProcessingType: 'exporter',
      materialSuffix: 'FB',
      regNumber,
      accNumber,
      rows: {
        'Exported (sections 1, 2 and 3)': [
          exportedRowFields(9001),
          exportedRowFields(9002)
        ]
      }
    })

    await runDeleteCreatedPrn(page, {
      wasteProcessingType: 'Exporter',
      material: 'Fibre-based composite material (R3)',
      regNumber,
      accNumber,
      seedOverseasSites: true,
      summaryLogContent,
      expectedWasteBalance: '1,000.00',
      expectedDeductedWasteBalance: '797.00',
      isPern: true,
      createNewLinkName: 'createNewPERNLink',
      manageLinkName: 'managePERNsLink'
    })
  })
})
