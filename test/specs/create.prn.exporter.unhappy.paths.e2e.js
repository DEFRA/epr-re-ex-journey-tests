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
      isPern: true,
      summaryLogFilePath: `resources/sanity/exporter_${accNumber}_${regNumber}.xlsx`,
      createNewLinkName: 'createNewPERNLink',
      manageLinkName: 'managePERNsLink'
    })
  })
})
