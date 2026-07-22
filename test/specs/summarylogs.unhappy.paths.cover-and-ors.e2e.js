import { $, browser, expect } from '@wdio/globals'
import HomePage from 'page-objects/homepage.js'
import UploadSummaryLogPage from '../page-objects/upload.summary.log.page.js'
import CheckSummaryLogPage from '../page-objects/check.summary.log.page.js'
import WasteRecordsPage from '../page-objects/waste.records.page.js'
import DashboardPage from '../page-objects/dashboard.page.js'
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
describe('Summary Logs - Unhappy paths - Cover sheet and ORS @unhappyPaths', () => {
  // Resets the shared browser session between tests so leftover auth state does
  // not auto-log-in and skip the stub's user-selection page (see CMA spec).
  afterEach(async () => {
    await browser.reloadSession()
  })

  it('Should get cover sheet validation error messages @coverValidationErrors', async () => {
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

    await createLinkAndLogin(organisationDetails.refNo, migrationResponse.email)

    await DashboardPage.selectLink(1)

    // Single-registration orgs skip the selection list, so the reg/acc
    // numbers render as plain text on the task page, not as links.
    await checkBodyText('E25SR500020912PP', 10)
    await checkBodyText('E-ACC12245PP', 10)

    await WasteRecordsPage.submitSummaryLogLink()

    await expect(browser).toHaveTitle(
      expect.stringContaining('Summary log: upload')
    )

    const uploadInput = await $('#summary-log-upload')
    await uploadInput.waitForExist({ timeout: 10000 })

    await UploadSummaryLogPage.uploadFile('resources/cover-invalid.xlsx')
    await UploadSummaryLogPage.continue()

    await checkBodyText('Your summary log is being checked', 30)

    await checkBodyText(
      "Material on summary log's 'Cover' tab is missing or incorrect",
      60
    )
    await checkBodyText(
      "Registration number on summary log's 'Cover' tab is missing or incorrect",
      60
    )
    await checkBodyText(
      "Accreditation number on summary log's 'Cover' tab is missing or incorrect",
      60
    )

    await checkBodyTextDoesNotInclude(
      'Sorry, there is a problem with the service - try again later',
      60
    )

    await HomePage.signOut()
    await expect(browser).toHaveTitle(expect.stringContaining('Signed out'))
  })

  it('Should warn on the check page when an OSR_ID has no matching overseas site @orsNotFound', async () => {
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

    await createLinkAndLogin(organisationDetails.refNo, migrationResponse.email)

    await DashboardPage.selectLink(1)
    await WasteRecordsPage.submitSummaryLogLink()

    await UploadSummaryLogPage.uploadFile(
      'resources/exporter-ors-not-found.xlsx'
    )
    await UploadSummaryLogPage.continue()

    await checkBodyText('Your summary log is being checked', 30)
    await checkBodyText(
      'Your summary log data has been checked and is now ready for you to upload',
      60
    )
    await checkBodyText(
      'new loads will be recorded (but will NOT add to your waste balance)',
      10
    )

    await UploadSummaryLogPage.expandLoadsList()
    await checkBodyText(
      'The OSR_ID has no matching overseas site registration',
      10
    )

    await CheckSummaryLogPage.upload()
    await checkBodyText('Your waste records are being updated', 30)
    await checkBodyText('Summary log uploaded', 60)

    await UploadSummaryLogPage.clickOnReturnToHomePage()
    const availableWasteBalance = await DashboardPage.availableWasteBalance(1)
    expect(availableWasteBalance).toBe('0.00')

    await HomePage.signOut()
    await expect(browser).toHaveTitle(expect.stringContaining('Signed out'))
  })
})
