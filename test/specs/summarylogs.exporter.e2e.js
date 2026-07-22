import { browser, expect } from '@wdio/globals'
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
  seedOverseasSites,
  createLinkedOrganisation,
  updateMigratedOrganisation
} from '../support/apicalls.js'
import { createLinkAndLogin } from '../support/login-helper.js'

// PAE-1648 closed-period adjustment messaging copy (en.json
// summary-log:closedPeriodAdjustments). Only the "absent" half is relevant
// here — this org's upload never has closed-period adjustments, matching
// (and merged from) the "no closed-period adjustments" case previously in
// summarylogs.check.cma.messaging.e2e.js, which otherwise duplicated this
// exact org/upload setup just to assert the banner/messaging is absent.
const IMPORTANT_BODY =
  "If you upload this summary log, you'll need to create a new report for any relevant period and an approved person from your business will need to resubmit it to your regulator."
const FURTHER_ACTION_HEADING = 'Further action needed'

describe('Summary Logs Exporter', () => {
  it('Should be able to submit a Exporter Summary Log spreadsheet, with no closed-period messaging @exporter @closedPeriodMessaging', async () => {
    const organisationDetails = await createLinkedOrganisation([
      { material: 'Paper or board (R3)', wasteProcessingType: 'Reprocessor' },
      { material: 'Paper or board (R3)', wasteProcessingType: 'Exporter' }
    ])

    // We adjust validFrom date to test filtering of rows from the Summary Log upload
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
          validFrom: '2025-02-02'
        }
      ]
    )
    await seedOverseasSites(
      organisationDetails.refNo,
      [1],
      [124, 183, 512, 876]
    )

    await createLinkAndLogin(organisationDetails.refNo, migrationResponse.email)

    await DashboardPage.selectExportingTab()
    await DashboardPage.selectLink(1)

    // Single-registration orgs skip the selection list, so the reg/acc
    // numbers render as plain text on the task page, not as links.
    await checkBodyText('E25SR500030913PA', 10)
    await checkBodyText('ACC234567', 10)

    await WasteRecordsPage.submitSummaryLogLink()

    await UploadSummaryLogPage.uploadFile('resources/exporter.xlsx')
    await UploadSummaryLogPage.continue()

    await checkBodyText('Your summary log is being checked', 30)
    await checkBodyText('Upload your summary log', 60)
    await checkBodyText('Open periods: new loads', 30)
    await checkBodyText(
      '2 new loads will be recorded (and will add to your waste balance)',
      30
    )

    // No closed-period adjustments in this upload, so the "Important" banner
    // shown on the check page for closed-period changes must not appear.
    expect(await CheckSummaryLogPage.importantBanner().isExisting()).toBe(false)
    await checkBodyTextDoesNotInclude(IMPORTANT_BODY, 5)

    await CheckSummaryLogPage.upload()

    await checkBodyText('Your waste records are being updated', 30)

    await checkBodyText('Summary log uploaded', 30)
    await checkBodyText('Your updated waste balance', 10)
    await checkBodyText('30.00 tonnes', 10)

    // Same closed-period-adjustment absence, this time on the success page's
    // "Further action needed" section and "Go to reports" button.
    await checkBodyTextDoesNotInclude(FURTHER_ACTION_HEADING, 5)
    expect(await UploadSummaryLogPage.goToReportsButton().isExisting()).toBe(
      false
    )

    await UploadSummaryLogPage.clickOnReturnToHomePage()

    await DashboardPage.selectExportingTab()

    let availableWasteBalance = await DashboardPage.availableWasteBalance(1)
    expect(availableWasteBalance).toBe('30.00')

    await DashboardPage.selectLink(1)
    const wasteBalanceAmount = await WasteRecordsPage.wasteBalanceAmount()

    expect(wasteBalanceAmount).toBe('30.00 tonnes')

    await WasteRecordsPage.submitSummaryLogLink()

    await UploadSummaryLogPage.uploadFile('resources/exporter-adjustments.xlsx')
    await UploadSummaryLogPage.continue()

    await checkBodyText('Your summary log is being checked', 30)
    await checkBodyText('Upload your summary log', 60)
    await checkBodyText('Open periods: new loads', 30)
    await checkBodyText(
      '3 new loads will be recorded (and will add to your waste balance)',
      30
    )
    await checkBodyText('Open periods: adjusted loads', 30)
    await checkBodyText(
      '1 adjusted load will be recorded (and will reflect in your waste balance)',
      30
    )
    await CheckSummaryLogPage.upload()

    await checkBodyText('Your waste records are being updated', 30)

    await checkBodyText('Summary log uploaded', 30)
    await checkBodyText('Your updated waste balance', 10)
    await checkBodyText('139.00 tonnes', 10)

    await UploadSummaryLogPage.clickOnReturnToHomePage()

    await DashboardPage.selectExportingTab()

    availableWasteBalance = await DashboardPage.availableWasteBalance(1)
    expect(availableWasteBalance).toBe('139.00')

    await HomePage.signOut()
    await expect(browser).toHaveTitle(expect.stringContaining('Signed out'))
  })
})
