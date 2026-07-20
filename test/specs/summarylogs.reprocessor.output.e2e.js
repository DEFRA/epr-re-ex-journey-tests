import { browser, expect } from '@wdio/globals'
import HomePage from 'page-objects/homepage.js'
import UploadSummaryLogPage from '../page-objects/upload.summary.log.page.js'
import EnhancedCheckSummaryLogPage from '../page-objects/enhanced.check.summary.log.page.js'
import WasteRecordsPage from '../page-objects/waste.records.page.js'
import DashboardPage from '../page-objects/dashboard.page.js'
import { checkBodyText } from '../support/checks.js'
import {
  createLinkedOrganisation,
  updateMigratedOrganisation
} from '../support/apicalls.js'
import { createLinkAndLogin } from '../support/login-helper.js'

describe('Summary Logs Reprocessor Output', () => {
  it('Should be able to submit a (Steel) Reprocessor Output Summary Log spreadsheet (6 rows total, but only 1 added for waste balance) @reproOutput', async () => {
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

    await createLinkAndLogin(organisationDetails.refNo, migrationResponse.email)

    const dashboardHeaderText = await DashboardPage.dashboardHeaderText()

    expect(dashboardHeaderText).toContain(
      organisationDetails.organisation.companyName
    )

    await DashboardPage.selectLink(1)

    // Single-registration orgs skip the selection list, so the reg/acc
    // numbers render as plain text on the task page, not as links.
    await checkBodyText('R25SR500050912PA', 10)
    await checkBodyText('ACC500591', 10)

    await WasteRecordsPage.submitSummaryLogLink()
    await expect(browser).toHaveTitle(
      expect.stringContaining('Summary log: upload')
    )
    await UploadSummaryLogPage.uploadFile('resources/reprocessor-output.xlsx')
    await UploadSummaryLogPage.continue()

    await checkBodyText('Your summary log is being checked', 30)

    await checkBodyText('Upload your summary log', 60)
    await checkBodyText('Open periods: new loads', 30)
    await checkBodyText(
      '1 new load will be recorded (and will add to your waste balance)',
      30
    )
    await EnhancedCheckSummaryLogPage.upload()

    await checkBodyText('Your waste records are being updated', 30)

    await checkBodyText('Summary log uploaded', 30)
    await checkBodyText('Your updated waste balance', 10)
    await checkBodyText('3.00 tonnes', 10)

    await UploadSummaryLogPage.clickOnReturnToHomePage()

    let availableWasteBalance = await DashboardPage.availableWasteBalance(1)
    expect(availableWasteBalance).toBe('3.00')

    await DashboardPage.selectLink(1)
    let wasteBalanceAmount = await WasteRecordsPage.wasteBalanceAmount()

    expect(wasteBalanceAmount).toBe('3.00 tonnes')

    await WasteRecordsPage.submitSummaryLogLink()
    await expect(browser).toHaveTitle(
      expect.stringContaining('Summary log: upload')
    )
    await UploadSummaryLogPage.uploadFile(
      'resources/reprocessor-output-adjustments.xlsx'
    )
    await UploadSummaryLogPage.continue()

    await checkBodyText('Your summary log is being checked', 30)

    await checkBodyText('Upload your summary log', 60)
    await checkBodyText('Open periods: adjusted loads', 30)
    await checkBodyText(
      '1 adjusted load will be recorded (and will reflect in your waste balance)',
      30
    )
    await EnhancedCheckSummaryLogPage.upload()

    await checkBodyText('Your waste records are being updated', 30)

    await checkBodyText('Summary log uploaded', 30)
    await checkBodyText('Your updated waste balance', 10)
    await checkBodyText('9.25 tonnes', 10)

    await UploadSummaryLogPage.clickOnReturnToHomePage()

    availableWasteBalance = await DashboardPage.availableWasteBalance(1)
    expect(availableWasteBalance).toBe('9.25')

    await DashboardPage.selectLink(1)
    wasteBalanceAmount = await WasteRecordsPage.wasteBalanceAmount()

    expect(wasteBalanceAmount).toBe('9.25 tonnes')

    await HomePage.signOut()
    await expect(browser).toHaveTitle(expect.stringContaining('Signed out'))
  })
})
