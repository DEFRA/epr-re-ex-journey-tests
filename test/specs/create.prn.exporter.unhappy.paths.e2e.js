import { test } from '@playwright/test'
import { secondTradingName as tradingName } from '../support/fixtures.js'
import { runCreatePrnUnhappyPaths } from '../support/create-prn-unhappy-paths.js'

test.describe('Create Packing Recycling Notes (Exporter)', () => {
  test('Should test various (Unhappy) paths for Create PRN Exporter @prnexporter', async ({
    page
  }) => {
    await runCreatePrnUnhappyPaths(page, {
      wasteProcessingType: 'Exporter',
      material: 'Aluminium (R4)',
      materialDesc: 'Aluminium',
      regNumber: 'E25SR500020912AL',
      accNumber: 'E-ACC12245AL',
      tradingName,
      process: 'R4',
      isPern: true,
      createNewLinkName: 'createNewPERNLink',
      manageLinkName: 'managePERNsLink'
    })
  })
})
