import { test } from '@playwright/test'
import { secondTradingName as tradingName } from '../support/fixtures.js'
import { runCreatePrnUnhappyPaths } from '../support/create-prn-unhappy-paths.js'
import { generateSummaryLogContent } from '../support/spreadsheet/summarylogs-content-generator.js'

test.describe('Create Packing Recycling Notes (Exporter)', () => {
  test('Should test various (Unhappy) paths for Create PRN Exporter @prnExporter', async ({
    page
  }) => {
    const regNumber = 'R26EX5000000002AL'
    const accNumber = 'A26EX5000000002AL'

    const summaryLogContent = await generateSummaryLogContent({
      wasteProcessingType: 'exporter',
      materialSuffix: 'AL',
      regNumber,
      accNumber,
      rows: {
        'Exported (sections 1, 2 and 3)': [
          {
            rowId: 9001,
            fields: {
              WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE: 'No',
              DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE: 'No',
              WAS_THE_WASTE_REFUSED: 'No',
              WAS_THE_WASTE_STOPPED: 'No',
              OSR_ID: 100,
              TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 500
            }
          }
        ]
      }
    })

    await runCreatePrnUnhappyPaths(page, {
      wasteProcessingType: 'Exporter',
      material: 'Aluminium (R4)',
      materialDesc: 'Aluminium',
      regNumber,
      accNumber,
      seedOverseasSites: true,
      summaryLogContent,
      tradingName,
      process: 'R4',
      isPern: true,
      createNewLinkName: 'createNewPERNLink',
      manageLinkName: 'managePERNsLink'
    })
  })
})
