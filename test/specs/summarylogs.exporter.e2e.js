import { browser, expect } from '@wdio/globals'
import HomePage from 'page-objects/homepage.js'
import UploadSummaryLogPage from '../page-objects/upload.summary.log.page.js'
import EnhancedCheckSummaryLogPage from '../page-objects/enhanced.check.summary.log.page.js'
import WasteRecordsPage from '../page-objects/waste.records.page.js'
import DashboardPage from '../page-objects/dashboard.page.js'
import { checkBodyText } from '../support/checks.js'
import {
  seedOverseasSites,
  createLinkedOrganisation,
  updateMigratedOrganisation
} from '../support/apicalls.js'
import { createLinkAndLogin } from '../support/login-helper.js'

describe('Summary Logs Exporter', () => {
  it('Should be able to submit a Exporter Summary Log spreadsheet @exporter', async () => {
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
    await EnhancedCheckSummaryLogPage.upload()

    await checkBodyText('Your waste records are being updated', 30)

    await checkBodyText('Summary log uploaded', 30)
    await checkBodyText('Your updated waste balance', 10)
    await checkBodyText('30.00 tonnes', 10)

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
    await EnhancedCheckSummaryLogPage.upload()

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
