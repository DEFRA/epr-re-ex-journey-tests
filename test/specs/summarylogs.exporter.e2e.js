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

// The adjusted-loads accordion's "added" heading, asserted by the stage-2
// checks merged in from summarylogs.check.cma.adjusted-loads.e2e.js's
// openAdjusted case below (same org/upload setup, duplicated purely to
// assert the check page's sub-state/accordion/projection content).
const ADJUSTED_ADDED_HEADING = 'This load has added to your waste balance'

test.describe('Summary Logs Exporter', () => {
  test('Should be able to submit a Exporter Summary Log spreadsheet, with no closed-period messaging @exporter @closedPeriodMessaging', async ({
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

    await createLinkAndLogin(
      page,
      organisationDetails.refNo,
      migrationResponse.email
    )

    await dashboardPage.selectExportingTab()
    await dashboardPage.selectLink(1)

    // Single-registration orgs skip the selection list, so the reg/acc
    // numbers render as plain text on the task page, not as links.
    await checkBodyText(page, 'E25SR500030913PA', 10)
    await checkBodyText(page, 'ACC234567', 10)

    await wasteRecordsPage.submitSummaryLogLink()

    await uploadSummaryLogPage.uploadFile('resources/exporter.xlsx')
    await uploadSummaryLogPage.continue()

    await checkBodyText(page, 'Your summary log is being checked', 30)
    await checkBodyText(page, 'Upload your summary log', 60)
    await checkBodyText(page, 'Open periods: new loads', 30)

    // Merged from summarylogs.check.cma.sections.e2e.js's noClosedSection
    // case (same org/upload setup, duplicated purely to assert the check
    // page's sub-state content and the absence of closed-period sections).
    const stage1SubStates = (
      await checkSummaryLogPage.allSubStateHeadings()
    ).join(' | ')
    expect(stage1SubStates).toContain(
      '2 new loads will be recorded (and will add to your waste balance)'
    )
    expect(stage1SubStates).toContain(
      '1 new load will be recorded (but will NOT add to your waste balance)'
    )
    const stage1BodyText = await page.evaluate(() => document.body.innerText)
    expect(stage1BodyText).toContain(
      'The new loads will add 30.00 tonnes to your waste balance.'
    )
    await checkBodyTextDoesNotInclude(page, 'Closed periods: new loads', 5)
    await checkBodyTextDoesNotInclude(page, 'Closed periods: adjusted loads', 5)

    // No closed-period adjustments in this upload, so the "Important" banner
    // shown on the check page for closed-period changes must not appear.
    expect((await checkSummaryLogPage.importantBanner().count()) > 0).toBe(
      false
    )
    await checkBodyTextDoesNotInclude(page, IMPORTANT_BODY, 5)

    await checkSummaryLogPage.upload()

    await checkBodyText(page, 'Your waste records are being updated', 30)

    await checkBodyText(page, 'Summary log uploaded', 30)
    await checkBodyText(page, 'Your updated waste balance', 10)
    await checkBodyText(page, '30.00 tonnes', 10)

    // Same closed-period-adjustment absence, this time on the success page's
    // "Further action needed" section and "Go to reports" button.
    await checkBodyTextDoesNotInclude(page, FURTHER_ACTION_HEADING, 5)
    expect((await uploadSummaryLogPage.goToReportsButton().count()) > 0).toBe(
      false
    )

    await uploadSummaryLogPage.clickOnReturnToHomePage()

    await dashboardPage.selectExportingTab()

    let availableWasteBalance = await dashboardPage.availableWasteBalance(1)
    expect(availableWasteBalance).toBe('30.00')

    await dashboardPage.selectLink(1)
    const wasteBalanceAmount = await wasteRecordsPage.wasteBalanceAmount()

    expect(wasteBalanceAmount).toBe('30.00 tonnes')

    await wasteRecordsPage.submitSummaryLogLink()

    await uploadSummaryLogPage.uploadFile('resources/exporter-adjustments.xlsx')
    await uploadSummaryLogPage.continue()

    await checkBodyText(page, 'Your summary log is being checked', 30)
    await checkBodyText(page, 'Upload your summary log', 60)
    await checkBodyText(page, 'Open periods: new loads', 30)
    await checkBodyText(
      page,
      '3 new loads will be recorded (and will add to your waste balance)',
      30
    )
    await checkBodyText(page, 'Open periods: adjusted loads', 30)
    await checkBodyText(
      page,
      '1 adjusted load will be recorded (and will reflect in your waste balance)',
      30
    )

    // Merged from summarylogs.check.cma.adjusted-loads.e2e.js's openAdjusted
    // case (same org/upload setup, duplicated purely to assert the check
    // page's sub-state/accordion content and pre-submit balance projection).
    const sections = await checkSummaryLogPage.allSectionHeadings()
    expect(sections).toEqual(
      expect.arrayContaining([
        'Open periods: new loads',
        'Open periods: adjusted loads'
      ])
    )
    const stage2SubStates = (
      await checkSummaryLogPage.allSubStateHeadings()
    ).join(' | ')
    expect(stage2SubStates).toContain(
      '1 new load will be recorded (but will NOT add to your waste balance)'
    )
    expect(stage2SubStates).toContain(
      '1 change is NOT relevant to your waste balance'
    )
    // Guard on the projection (renders last, at page bottom) so the raw read
    // below isn't taken mid-parse; the expect()s keep the value diagnostics.
    await checkBodyText(
      page,
      'If you upload this summary log to create a new report, your waste balance will be 139.00 (from 30.00)',
      10
    )
    const stage2BodyText = await page.evaluate(() => document.body.innerText)
    expect(stage2BodyText).toContain(
      'The new loads will add 99.00 tonnes to your waste balance.'
    )
    expect(stage2BodyText).toContain(
      'The adjusted loads will add 10.00 tonnes to your waste balance.'
    )
    expect(stage2BodyText).toContain(
      'The loads include all the required summary log data.'
    )
    expect(stage2BodyText).toContain('depending on the adjustment.')

    await checkSummaryLogPage.expandAllLoadDetails()
    const rows = await checkSummaryLogPage.loadRowItems()
    expect(rows.some((r) => r.includes('Row ID'))).toBe(true)
    const detailsText = await checkSummaryLogPage.loadDetailsText()
    expect(detailsText).toContain(ADJUSTED_ADDED_HEADING)

    await checkSummaryLogPage.upload()

    await checkBodyText(page, 'Your waste records are being updated', 30)

    await checkBodyText(page, 'Summary log uploaded', 30)
    await checkBodyText(page, 'Your updated waste balance', 10)
    await checkBodyText(page, '139.00 tonnes', 10)

    await uploadSummaryLogPage.clickOnReturnToHomePage()

    await dashboardPage.selectExportingTab()

    availableWasteBalance = await dashboardPage.availableWasteBalance(1)
    expect(availableWasteBalance).toBe('139.00')

    await homePage.signOut()
    await expect(page).toHaveTitle(/Signed out/)
  })
})
