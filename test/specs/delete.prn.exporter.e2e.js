import { test } from '@playwright/test'
import { runDeleteCreatedPrn } from '../support/delete-created-prn.js'

test.describe('Deleting Packing Recycling Notes (Exporter)', () => {
  test('Should be able to create and delete PRN for Fibre (Exporter) @delprnexp', async ({
    page
  }) => {
    const regNumber = 'E25SR500020912FB'
    const accNumber = 'E-ACC12245FB'

    await runDeleteCreatedPrn(page, {
      wasteProcessingType: 'Exporter',
      material: 'Fibre-based composite material (R3)',
      regNumber,
      accNumber,
      seedOverseasSites: true,
      summaryLogFilePath: `resources/sanity/exporter_${accNumber}_${regNumber}.xlsx`,
      expectedWasteBalance: '1,580.71 tonnes',
      expectedDeductedWasteBalance: '1,377.71 tonnes',
      isPern: true,
      createNewLinkName: 'createNewPERNLink',
      manageLinkName: 'managePERNsLink'
    })
  })
})
