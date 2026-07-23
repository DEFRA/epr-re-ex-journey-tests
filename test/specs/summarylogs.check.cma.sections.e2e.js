import { test, expect } from '@playwright/test'
import { HomePage } from 'page-objects/homepage.js'
import { UploadSummaryLogPage } from '../page-objects/upload.summary.log.page.js'
import { CheckSummaryLogPage } from '../page-objects/check.summary.log.page.js'
import { WasteRecordsPage } from '../page-objects/waste.records.page.js'
import { DashboardPage } from '../page-objects/dashboard.page.js'
import {
  checkBodyText,
  checkBodyTextDoesNotInclude
} from '../support/checks.js'
import {
  seedOverseasSites,
  createLinkedOrganisation,
  updateMigratedOrganisation,
  seedSubmittedReport
} from '../support/apicalls.js'
import {
  createLinkAndLogin,
  registerAndLinkDefraIdUser,
  loginViaHomePage
} from '../support/login-helper.js'

// Split from summarylogs.check.cma.e2e.js (PAE-1405 CI runtime work): this
// group covers which sections render at all - open vs closed, present vs
// absent. See summarylogs.check.cma.adjusted-loads.e2e.js for adjusted-load
// sub-state assertions and summarylogs.check.cma.messaging.e2e.js for the
// closed-period banner/messaging copy. Splitting lets per-file worker
// scheduling run these in parallel instead of serially in one ~4 minute file.
test.describe('Summary Logs - Check Page with CMA Detection - Section Visibility', () => {
  // The "should not display closed period sections when uploading loads only
  // to open periods @noClosedSection" case used to live here, but its
  // org/upload setup was byte-for-byte identical to summarylogs.exporter.e2e.js's
  // happy-path test, just to assert the check page's sub-state content and
  // the absence of closed-period sections - merged there instead.

  test('should display empty state for file with no changes @enhancedEmptyState @cma', async ({
    page
  }) => {
    const homePage = new HomePage(page)
    const uploadSummaryLogPage = new UploadSummaryLogPage(page)
    const wasteRecordsPage = new WasteRecordsPage(page)
    const dashboardPage = new DashboardPage(page)

    const organisationDetails = await createLinkedOrganisation([
      { material: 'Steel (R4)', wasteProcessingType: 'Reprocessor' }
    ])

    const migrationResponse = await updateMigratedOrganisation(
      organisationDetails.refNo,
      [
        {
          reprocessingType: 'output',
          regNumber: 'R25SR500050912PA',
          accNumber: 'ACC500591',
          status: 'approved',
          validFrom: '2026-01-01'
        }
      ]
    )

    await createLinkAndLogin(
      page,
      organisationDetails.refNo,
      migrationResponse.email
    )

    const dashboardHeaderText = await dashboardPage.dashboardHeaderText()

    expect(dashboardHeaderText).toContain(
      organisationDetails.organisation.companyName
    )

    await dashboardPage.selectLink(1)

    // Single-registration orgs skip the selection list, so the reg number
    // renders as plain text on the task page, not as a link.
    await checkBodyText(page, 'R25SR500050912PA', 10)

    await wasteRecordsPage.submitSummaryLogLink()
    await uploadSummaryLogPage.performUploadAndReturnToHomepage(
      'resources/reprocessor-output.xlsx'
    )

    await dashboardPage.selectLink(1)
    await wasteRecordsPage.submitSummaryLogLink()
    await uploadSummaryLogPage.uploadFile('resources/reprocessor-output.xlsx')
    await uploadSummaryLogPage.continue()

    await checkBodyText(page, 'Your summary log is being checked', 30)
    await checkBodyText(page, 'Upload your summary log', 60)

    await checkBodyText(
      page,
      'No new loads have been added to your open period',
      30
    )
    await checkBodyText(
      page,
      'No adjustments have been made to your open period',
      30
    )
    await checkBodyText(
      page,
      'No new loads have been added to your closed periods',
      30
    )
    await checkBodyText(
      page,
      'No adjustments have been made to your closed periods',
      30
    )

    await homePage.signOut()
    await expect(page).toHaveTitle(/Signed out/)
  })

  // The "should display the closed period section when CMAs are detected
  // @cmaDetected" case used to live here, but its org/upload setup was
  // byte-for-byte identical to the "detected" test in
  // summarylogs.check.cma.messaging.e2e.js, just to assert the check page's
  // closed-period heading and sub-state content - merged there instead.

  test('should not display open period sections when all loads are in closed periods @noOpenSection @cma', async ({
    page
  }) => {
    const homePage = new HomePage(page)
    const uploadSummaryLogPage = new UploadSummaryLogPage(page)
    const checkSummaryLogPage = new CheckSummaryLogPage(page)
    const wasteRecordsPage = new WasteRecordsPage(page)
    const dashboardPage = new DashboardPage(page)

    const organisationDetails = await createLinkedOrganisation([
      {
        material: 'Paper or board (R3)',
        wasteProcessingType: 'Reprocessor',
        withoutAccreditation: true
      }
    ])

    const migrationResponse = await updateMigratedOrganisation(
      organisationDetails.refNo,
      [
        {
          reprocessingType: 'output',
          regNumber: 'R25SR500040912PA',
          status: 'approved',
          withoutAccreditation: true,
          validFrom: '2025-01-01'
        }
      ]
    )

    const user = await registerAndLinkDefraIdUser(
      organisationDetails.refNo,
      migrationResponse.email
    )

    const regId = migrationResponse.registrationIds[0]

    await seedSubmittedReport(
      organisationDetails.refNo,
      regId,
      user.userId,
      2025,
      'quarterly',
      1,
      1,
      { tonnageRecycled: 100, tonnageNotRecycled: 0 }
    )

    await loginViaHomePage(page, migrationResponse.email)

    await dashboardPage.selectLink(1)

    await wasteRecordsPage.submitSummaryLogLink()

    await uploadSummaryLogPage.uploadFile(
      'resources/reprocessor-output-regonly-cma-2025.xlsx'
    )
    await uploadSummaryLogPage.continue()

    await checkBodyText(page, 'Your summary log is being checked', 30)
    await checkBodyText(page, 'Upload your summary log', 60)

    await checkBodyText(page, 'Closed periods:', 30)
    const subStates = (await checkSummaryLogPage.allSubStateHeadings()).join(
      ' | '
    )
    expect(subStates).toContain('8 new loads will be recorded')
    await checkBodyText(page, 'These have been added to your summary log.', 30)

    await checkBodyTextDoesNotInclude(page, 'Open periods: new loads', 5)
    await checkBodyTextDoesNotInclude(page, 'Open periods: adjusted loads', 5)

    await homePage.signOut()
    await expect(page).toHaveTitle(/Signed out/)
  })

  test('should not display open period sections for an accredited operator with only closed loads @noOpenSectionAccredited @cma', async ({
    page
  }) => {
    const homePage = new HomePage(page)
    const uploadSummaryLogPage = new UploadSummaryLogPage(page)
    const checkSummaryLogPage = new CheckSummaryLogPage(page)
    const wasteRecordsPage = new WasteRecordsPage(page)
    const dashboardPage = new DashboardPage(page)

    const organisationDetails = await createLinkedOrganisation([
      { material: 'Paper or board (R3)', wasteProcessingType: 'Reprocessor' },
      { material: 'Paper or board (R3)', wasteProcessingType: 'Exporter' }
    ])

    const migrationResponse = await updateMigratedOrganisation(
      organisationDetails.refNo,
      [
        {
          reprocessingType: 'output',
          regNumber: 'R25SR5111050912PA',
          accNumber: 'ACC123456',
          status: 'approved'
        },
        {
          regNumber: 'E25SR500030913PA',
          accNumber: 'ACC234567',
          status: 'approved',
          validFrom: '2025-01-01'
        }
      ]
    )
    await seedOverseasSites(
      organisationDetails.refNo,
      [1],
      [124, 183, 512, 876]
    )

    const user = await createLinkAndLogin(
      page,
      organisationDetails.refNo,
      migrationResponse.email
    )

    await dashboardPage.selectExportingTab()
    await dashboardPage.selectLink(1)

    await wasteRecordsPage.submitSummaryLogLink()
    await uploadSummaryLogPage.performUploadAndReturnToHomepage(
      'resources/exporter-2025.xlsx'
    )

    const exporterRegId = migrationResponse.registrationIds[1]
    await seedSubmittedReport(
      organisationDetails.refNo,
      exporterRegId,
      user.userId,
      2025,
      'monthly',
      1,
      1,
      { prnRevenue: 100, freeTonnage: 0 }
    )

    await dashboardPage.selectExportingTab()
    await dashboardPage.selectLink(1)
    await wasteRecordsPage.submitSummaryLogLink()
    await uploadSummaryLogPage.uploadFile(
      'resources/exporter-adjustments-2025.xlsx'
    )
    await uploadSummaryLogPage.continue()

    await checkBodyText(page, 'Your summary log is being checked', 30)
    await checkBodyText(page, 'Upload your summary log', 60)

    await checkBodyText(page, 'Closed periods:', 30)
    const subStates = (await checkSummaryLogPage.allSubStateHeadings()).join(
      ' | '
    )
    expect(subStates).toContain(
      '3 new loads will be recorded (and will add to your waste balance)'
    )
    expect(subStates).toContain(
      '1 new load will be recorded (but will NOT add to your waste balance)'
    )
    expect(subStates).toContain(
      '1 adjusted load will be recorded (and will reflect in your waste balance)'
    )

    // Guard on the projection (renders last, at page bottom) so the raw read
    // below isn't taken mid-parse; the expect()s keep the value diagnostics.
    await checkBodyText(
      page,
      'If you upload this summary log to create a new report, your waste balance will be 139.00 (from 30.00)',
      10
    )
    const bodyText = await page.evaluate(() => document.body.innerText)
    expect(bodyText).toContain(
      'The new loads will add 99.00 tonnes to your waste balance.'
    )
    expect(bodyText).toContain(
      'The adjusted loads will add 10.00 tonnes to your waste balance.'
    )
    expect(bodyText).toContain(
      'If you upload this summary log to create a new report, your waste balance will be 139.00 (from 30.00)'
    )

    await checkBodyTextDoesNotInclude(page, 'Open periods: new loads', 5)
    await checkBodyTextDoesNotInclude(page, 'Open periods: adjusted loads', 5)

    await homePage.signOut()
    await expect(page).toHaveTitle(/Signed out/)
  })
})
