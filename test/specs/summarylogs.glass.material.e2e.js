import { $, browser, expect } from '@wdio/globals'
import HomePage from 'page-objects/homepage.js'
import DashboardPage from '../page-objects/dashboard.page.js'
import WasteRecordsPage from '../page-objects/waste.records.page.js'
import {
  createLinkedOrganisation,
  updateMigratedOrganisation
} from '../support/apicalls.js'
import UploadSummaryLogPage from 'page-objects/upload.summary.log.page.js'
import { checkBodyText } from '../support/checks.js'
import { createLinkAndLogin } from '../support/login-helper.js'

describe('Summary Logs (Glass Material) @smoketest', () => {
  it('Should be able to distinguish between Glass Re-Melt and Glass Other @glassMaterial', async () => {
    const organisationDetails = await createLinkedOrganisation([
      {
        material: 'Glass (R5)',
        wasteProcessingType: 'Reprocessor',
        glassRecyclingProcess: 'Glass re-melt'
      },
      {
        material: 'Glass (R5)',
        wasteProcessingType: 'Reprocessor',
        glassRecyclingProcess: 'Glass other'
      },
      {
        material: 'Glass (R5)',
        wasteProcessingType: 'Exporter',
        glassRecyclingProcess: 'Glass other'
      }
    ])

    const migrationResponse = await updateMigratedOrganisation(
      organisationDetails.refNo,
      [
        {
          reprocessingType: 'output',
          regNumber: 'R25SR5111050912GR',
          accNumber: '7812331GR',
          status: 'approved'
        },
        {
          reprocessingType: 'input',
          regNumber: 'R25SR5111050912GO',
          accNumber: '12345678GO',
          status: 'approved'
        },
        {
          reprocessingType: null,
          regNumber: 'E25SR500030913GO',
          accNumber: '234567GO',
          status: 'approved'
        }
      ]
    )
    await createLinkAndLogin(organisationDetails.refNo, migrationResponse.email)

    const firstGlassMaterial = await DashboardPage.getMaterial(1, 1)
    expect(firstGlassMaterial).toBe('Glass remelt')

    const secondGlassMaterial = await DashboardPage.getMaterial(2, 1)
    expect(secondGlassMaterial).toBe('Glass other')

    await DashboardPage.selectExportingTab()
    const glassMaterial = await DashboardPage.getMaterial(1, 1)
    expect(glassMaterial).toBe('Glass other')

    await DashboardPage.selectLink(1)

    const regNo = await $('//a[normalize-space()="E25SR500030913GO"]')
    await expect(regNo).toExist()

    const accNo = await $('//a[normalize-space()="234567GO"]')
    await expect(accNo).toExist()

    let dashboardHeaderText = await WasteRecordsPage.dashboardHeaderText()
    expect(dashboardHeaderText).toContain('Glass other')

    await HomePage.homeLink()
    await DashboardPage.selectTableLink(1, 1)

    dashboardHeaderText = await WasteRecordsPage.dashboardHeaderText()
    expect(dashboardHeaderText).toContain('Glass remelt')

    // PAE-913: Verify summary logs upload doesn't allow random registration Id
    UploadSummaryLogPage.open(organisationDetails.refNo, 'invalidId')
    await checkBodyText('404', 10)
    await checkBodyText('Page not found', 10)
    // End of PAE-913 verification

    await HomePage.signOut()
    await expect(browser).toHaveTitle(expect.stringContaining('Signed out'))
  })
})
