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
  createLinkedOrganisation,
  updateMigratedOrganisation,
  seedOverseasSites
} from '../support/apicalls.js'
import { createLinkAndLogin } from '../support/login-helper.js'

// Split from summarylogs.unhappy.paths.e2e.js (PAE-1405 CI runtime work) so
// wdio's per-file worker scheduling can run these in parallel with
// summarylogs.unhappy.paths.template.e2e.js instead of serially in one file.
// This half covers cover-sheet validation and ORS lookup mismatches.
test.describe('Summary Logs - Unhappy paths - Cover sheet and ORS @unhappyPaths', () => {
  test('Should get cover sheet validation error messages @coverValidationErrors', async ({
    page
  }) => {
    const homePage = new HomePage(page)
    const uploadSummaryLogPage = new UploadSummaryLogPage(page)
    const wasteRecordsPage = new WasteRecordsPage(page)
    const dashboardPage = new DashboardPage(page)

    const organisationDetails = await createLinkedOrganisation([
      { material: 'Paper or board (R3)', wasteProcessingType: 'Exporter' }
    ])

    const migrationResponse = await updateMigratedOrganisation(
      organisationDetails.refNo,
      [
        {
          regNumber: 'E25SR500020912PP',
          accNumber: 'E-ACC12245PP',
          status: 'approved'
        }
      ]
    )

    await createLinkAndLogin(
      page,
      organisationDetails.refNo,
      migrationResponse.email
    )

    await dashboardPage.selectLink(1)

    // Single-registration orgs skip the selection list, so the reg/acc
    // numbers render as plain text on the task page, not as links.
    await checkBodyText(page, 'E25SR500020912PP', 10)
    await checkBodyText(page, 'E-ACC12245PP', 10)

    await wasteRecordsPage.submitSummaryLogLink()

    await expect(page).toHaveTitle(/Summary log: upload/)

    await uploadSummaryLogPage.uploadFile('resources/cover-invalid.xlsx')
    await uploadSummaryLogPage.continue()

    await checkBodyText(page, 'Your summary log is being checked', 30)

    await checkBodyText(
      page,
      "Material on summary log's 'Cover' tab is missing or incorrect",
      60
    )
    await checkBodyText(
      page,
      "Registration number on summary log's 'Cover' tab is missing or incorrect",
      60
    )
    await checkBodyText(
      page,
      "Accreditation number on summary log's 'Cover' tab is missing or incorrect",
      60
    )

    await checkBodyTextDoesNotInclude(
      page,
      'Sorry, there is a problem with the service - try again later',
      60
    )

    await homePage.signOut()
    await expect(page).toHaveTitle(/Signed out/)
  })

  test('Should warn on the check page when an OSR_ID has no matching overseas site @orsNotFound', async ({
    page
  }) => {
    const homePage = new HomePage(page)
    const uploadSummaryLogPage = new UploadSummaryLogPage(page)
    const checkSummaryLogPage = new CheckSummaryLogPage(page)
    const wasteRecordsPage = new WasteRecordsPage(page)
    const dashboardPage = new DashboardPage(page)

    const organisationDetails = await createLinkedOrganisation([
      { material: 'Paper or board (R3)', wasteProcessingType: 'Exporter' }
    ])

    const migrationResponse = await updateMigratedOrganisation(
      organisationDetails.refNo,
      [
        {
          regNumber: 'E25SR500030913PA',
          accNumber: 'ACC234567',
          status: 'approved',
          // Matches the happy-path exporter setup so the file's rows fall inside
          // the accreditation period and reach the ORS check (rather than being
          // ignored as OUTSIDE_ACCREDITATION_PERIOD).
          validFrom: '2025-02-02'
        }
      ]
    )

    // The file's export rows use OSR IDs 124, 439 and 512; seed an overseas site
    // under 999 so none of them match. ORS validation is always on for exporters,
    // so each unmatched row is excluded as ORS_NOT_FOUND (not silently dropped).
    await seedOverseasSites(organisationDetails.refNo, [0], [999])

    await createLinkAndLogin(
      page,
      organisationDetails.refNo,
      migrationResponse.email
    )

    await dashboardPage.selectLink(1)
    await wasteRecordsPage.submitSummaryLogLink()

    await uploadSummaryLogPage.uploadFile(
      'resources/exporter-ors-not-found.xlsx'
    )
    await uploadSummaryLogPage.continue()

    await checkBodyText(page, 'Your summary log is being checked', 30)
    await checkBodyText(
      page,
      'Your summary log data has been checked and is now ready for you to upload',
      60
    )
    await checkBodyText(
      page,
      'new loads will be recorded (but will NOT add to your waste balance)',
      10
    )

    await uploadSummaryLogPage.expandLoadsList()
    await checkBodyText(
      page,
      'The OSR_ID has no matching overseas site registration',
      10
    )

    await checkSummaryLogPage.upload()
    await checkBodyText(page, 'Your waste records are being updated', 30)
    await checkBodyText(page, 'Summary log uploaded', 60)

    await uploadSummaryLogPage.clickOnReturnToHomePage()
    const availableWasteBalance = await dashboardPage.availableWasteBalance(1)
    expect(availableWasteBalance).toBe('0.00')

    await homePage.signOut()
    await expect(page).toHaveTitle(/Signed out/)
  })
})
