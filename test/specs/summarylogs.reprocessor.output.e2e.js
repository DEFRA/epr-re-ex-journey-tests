import { test, expect } from '@playwright/test'
import { HomePage } from 'page-objects/homepage.js'
import { UploadSummaryLogPage } from '../page-objects/upload.summary.log.page.js'
import { CheckSummaryLogPage } from '../page-objects/check.summary.log.page.js'
import { WasteRecordsPage } from '../page-objects/waste.records.page.js'
import { DashboardPage } from '../page-objects/dashboard.page.js'
import { checkBodyText } from '../support/checks.js'
import {
  createLinkedOrganisation,
  updateMigratedOrganisation
} from '../support/seeding/organisation.js'
import { summaryLogNumbered } from '../support/seeding/summary-logs.js'
import { generateNumbers } from '../support/reg-acc-number.js'
import { createLinkAndLogin } from '../support/login-helper.js'

test.describe('Summary Logs Reprocessor Output', () => {
  test('Should be able to submit a (Steel) Reprocessor Output Summary Log spreadsheet (6 rows total, but only 1 added for waste balance) @reproOutput', async ({
    page
  }) => {
    const homePage = new HomePage(page)
    const uploadSummaryLogPage = new UploadSummaryLogPage(page)
    const checkSummaryLogPage = new CheckSummaryLogPage(page)
    const wasteRecordsPage = new WasteRecordsPage(page)
    const dashboardPage = new DashboardPage(page)

    const organisationDetails = await createLinkedOrganisation([
      { material: 'Steel (R4)', wasteProcessingType: 'Reprocessor' }
    ])
    const numbers = generateNumbers({
      wasteProcessingType: 'reprocessor',
      materialSuffix: 'PA'
    })

    const migrationResponse = await updateMigratedOrganisation(
      organisationDetails.refNo,
      [
        {
          reprocessingType: 'output',
          ...numbers,
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

    // Single-registration orgs skip the selection list, so the reg/acc
    // numbers render as plain text on the task page, not as links.
    await checkBodyText(page, numbers.regNumber, 10)
    await checkBodyText(page, numbers.accNumber, 10)

    await wasteRecordsPage.submitSummaryLogLink().click()
    await expect(page).toHaveTitle(/Summary log: upload/)
    await uploadSummaryLogPage.uploadFile(
      await summaryLogNumbered('resources/reprocessor-output.xlsx', numbers)
    )
    await uploadSummaryLogPage.continue()

    await checkBodyText(page, 'Your summary log is being checked', 30)

    await checkBodyText(page, 'Upload your summary log', 30)
    await checkBodyText(page, 'Open periods: new loads', 30)
    await checkBodyText(
      page,
      '1 new load will be recorded (and will add to your waste balance)',
      30
    )
    await checkSummaryLogPage.uploadButton().click()

    await checkBodyText(page, 'Your waste records are being updated', 30)

    await uploadSummaryLogPage.checkUploaded()
    await checkBodyText(page, 'Your updated waste balance', 10)
    await checkBodyText(page, '3.00 tonnes', 10)

    await uploadSummaryLogPage.returnToHomePageLink().click()

    let availableWasteBalance = await dashboardPage.availableWasteBalance(1)
    expect(availableWasteBalance).toBe('3.00')

    await dashboardPage.selectLink(1)
    let wasteBalanceAmount = await wasteRecordsPage.wasteBalanceAmount()

    expect(wasteBalanceAmount).toBe('3.00')

    await wasteRecordsPage.submitSummaryLogLink().click()
    await expect(page).toHaveTitle(/Summary log: upload/)
    await uploadSummaryLogPage.uploadFile(
      await summaryLogNumbered(
        'resources/reprocessor-output-adjustments.xlsx',
        numbers
      )
    )
    await uploadSummaryLogPage.continue()

    await checkBodyText(page, 'Your summary log is being checked', 30)

    await checkBodyText(page, 'Upload your summary log', 30)
    await checkBodyText(page, 'Open periods: adjusted loads', 30)
    await checkBodyText(
      page,
      '1 adjusted load will be recorded (and will reflect in your waste balance)',
      30
    )
    await checkSummaryLogPage.uploadButton().click()

    await checkBodyText(page, 'Your waste records are being updated', 30)

    await uploadSummaryLogPage.checkUploaded()
    await checkBodyText(page, 'Your updated waste balance', 10)
    await checkBodyText(page, '9.25 tonnes', 10)

    await uploadSummaryLogPage.returnToHomePageLink().click()

    availableWasteBalance = await dashboardPage.availableWasteBalance(1)
    expect(availableWasteBalance).toBe('9.25')

    await dashboardPage.selectLink(1)
    wasteBalanceAmount = await wasteRecordsPage.wasteBalanceAmount()

    expect(wasteBalanceAmount).toBe('9.25')

    await homePage.signOutLink().click()
    await expect(page).toHaveTitle(/Signed out/)
  })
})
