import { test, expect } from '@playwright/test'
import { HomePage } from 'page-objects/homepage.js'
import { DashboardPage } from '../page-objects/dashboard.page.js'
import { WasteRecordsPage } from '../page-objects/waste.records.page.js'
import {
  createLinkedOrganisation,
  updateMigratedOrganisation
} from '../support/apicalls.js'
import { UploadSummaryLogPage } from 'page-objects/upload.summary.log.page.js'
import { checkBodyText } from '../support/checks.js'
import { createLinkAndLogin } from '../support/login-helper.js'

test.describe('Summary Logs (Glass Material) @smoketest', () => {
  test('Should be able to distinguish between Glass Re-Melt and Glass Other @glassMaterial', async ({
    page
  }) => {
    const homePage = new HomePage(page)
    const dashboardPage = new DashboardPage(page)
    const wasteRecordsPage = new WasteRecordsPage(page)
    const uploadSummaryLogPage = new UploadSummaryLogPage(page)

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
    await createLinkAndLogin(
      page,
      organisationDetails.refNo,
      migrationResponse.email
    )

    const firstGlassMaterial = await dashboardPage.getMaterial(1, 1)
    expect(firstGlassMaterial).toBe('Glass remelt')

    const secondGlassMaterial = await dashboardPage.getMaterial(2, 1)
    expect(secondGlassMaterial).toBe('Glass other')

    await dashboardPage.selectExportingTab()
    const glassMaterial = await dashboardPage.getMaterial(1, 1)
    expect(glassMaterial).toBe('Glass other')

    await dashboardPage.selectLink(1)

    // Single-registration orgs skip the selection list, so the reg/acc
    // numbers render as plain text on the task page, not as links.
    await checkBodyText(page, 'E25SR500030913GO', 10)
    await checkBodyText(page, '234567GO', 10)

    let dashboardHeaderText = await wasteRecordsPage.dashboardHeaderText()
    expect(dashboardHeaderText).toContain('Glass other')

    await homePage.homeLink()
    await dashboardPage.selectTableLink(1, 1)

    dashboardHeaderText = await wasteRecordsPage.dashboardHeaderText()
    expect(dashboardHeaderText).toContain('Glass remelt')

    // PAE-913: Verify summary logs upload doesn't allow random registration Id
    await uploadSummaryLogPage.open(organisationDetails.refNo, 'invalidId')
    await checkBodyText(page, '404', 10)
    await checkBodyText(page, 'Page not found', 10)
    // End of PAE-913 verification

    await homePage.signOut()
    await expect(page).toHaveTitle(/Signed out/)
  })
})
