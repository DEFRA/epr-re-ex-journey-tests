import { test } from '@playwright/test'
import { secondTradingName as tradingName } from '../support/fixtures.js'
import { runCreatePrnUnhappyPaths } from '../support/create-prn-unhappy-paths.js'

test.describe('Create Packing Recycling Notes (Exporter)', () => {
  test('Should test various (Unhappy) paths for Create PRN Exporter @prnExporter', async ({
    page
  }) => {
    const regNumber = 'R26EX5000000002AL'
    const accNumber = 'A26EX5000000002AL'

    await runCreatePrnUnhappyPaths(page, {
      wasteProcessingType: 'Exporter',
      material: 'Aluminium (R4)',
      materialDesc: 'Aluminium',
      regNumber,
      accNumber,
      tradingName,
      process: 'R4',
      // Fixture is named acc_reg (accreditation number first); it seeds a
      // balance well above the 203-tonne draft tonnage, so the within-balance
      // drafts still reach the check page before the over-balance assertion.
      summaryLogFilePath: `resources/sanity/exporter_${accNumber}_${regNumber}.xlsx`,
      isPern: true,
      createNewLinkName: 'createNewPERNLink',
      manageLinkName: 'managePERNsLink'
    })
  })
})
