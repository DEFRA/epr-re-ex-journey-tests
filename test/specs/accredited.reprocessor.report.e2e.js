import { test, expect } from '@playwright/test'
import { HomePage } from 'page-objects/homepage.js'
import { ReportsPage } from 'page-objects/reports/reports.page.js'
import { ReportDetailPage } from 'page-objects/reports/report.detail.page.js'
import { TonnesRecycledPage } from '../page-objects/reports/tonnes.recycled.page.js'
import { TonnesNotRecycledPage } from '../page-objects/reports/tonnes.not.recycled.page.js'
import { ReprocessorPrnSummaryPage } from '../page-objects/reports/reprocessor.prn.summary.page.js'
import { FreePrnsPage } from '../page-objects/reports/free.prns.page.js'
import { ReportSupportingInformationPage } from 'page-objects/reports/report.supporting.information.page.js'
import { ReportCheckAnswersPage } from 'page-objects/reports/report.check.answers.page.js'
import { ConfirmDeleteReportPage } from '../page-objects/confirm.delete.report.page.js'
import {
  createLinkedOrganisation,
  reportsLandingHasNoClosedPeriod,
  updateMigratedOrganisation
} from '../support/seeding/organisation.js'
import { unsubmitReport } from '../support/seeding/reports.js'
import {
  registrationStartYear,
  submitSummaryLogContent
} from '../support/seeding/summary-logs.js'
import { generateNumbers } from '../support/reg-acc-number.js'
import { summaryLogContentNumbered } from '../support/spreadsheet/summarylogs-content-generator.js'
import {
  checkBodyText,
  checkBodyTextDoesNotInclude
} from '../support/checks.js'
import { checkAccessibility } from '../support/accessibility.js'
import { createLinkAndLogin } from '../support/login-helper.js'
import { defraIdStub } from '../support/defra-id-stub.js'
import { navigateToReports } from '../support/report-navigation.js'
import { ConfirmationPage } from '../page-objects/reports/confirmation.page.js'
import {
  switchToNewTab,
  closeCurrentTabAndReturn
} from '../support/windowtabs.js'
import { expectActionRequiredStatus } from '../support/report-status.js'
import { MonthlyReportDraftDeclarationPage } from 'page-objects/reports/monthly.report.draft.declaration.page.js'
import { ReportSubmittedPage } from 'page-objects/reports/report.submitted.page.js'
import { currentYear } from '~/test/support/date.js'
import { expectPeriodYear } from 'page-objects/reports/report-period.js'

// The operator starts and abandons the report three times before completing
// it, so the journey walks the wizard further than any single test budget.
const JOURNEY_TIMEOUT_MS = 4 * 60 * 1000

async function setupAccreditedReprocessor(page) {
  const numbers = generateNumbers({
    wasteProcessingType: 'reprocessor',
    materialSuffix: 'PA'
  })

  const organisationDetails = await createLinkedOrganisation([
    {
      material: 'Paper or board (R3)',
      wasteProcessingType: 'Reprocessor'
    }
  ])

  const migrationResponse = await updateMigratedOrganisation(
    organisationDetails.refNo,
    [
      {
        reprocessingType: 'output',
        ...numbers,
        status: 'approved'
      }
    ]
  )

  const user = await createLinkAndLogin(
    page,
    organisationDetails.refNo,
    migrationResponse.email
  )

  return { organisationDetails, migrationResponse, user, numbers }
}

// Submitted via epr-backend's dev endpoint rather than driving the upload
// UI: this journey is about the reports wizard, not the upload itself,
// which the dedicated summary-log specs already cover. The fixture's real
// row values are read straight off the checked-in xlsx, so they stay
// exactly what a real upload of it would have carried.
/** @param {import('../support/reg-acc-number.js').SeededNumbers} numbers */
async function uploadAndNavigateToReports(
  page,
  organisationDetails,
  migrationResponse,
  user,
  numbers
) {
  const summaryLogContent = await summaryLogContentNumbered(
    'resources/sanity/reprocessorOutput_A26ER5000000001PA_R26ER5000000001PA.xlsx',
    numbers
  )
  await submitSummaryLogContent(
    organisationDetails.refNo,
    migrationResponse.registrationIds[0],
    defraIdStub.authHeader(user.userId),
    summaryLogContent,
    registrationStartYear()
  )
  await navigateToReports(page)
}

test.describe('Accredited reprocessor report flow @accreditedReprocessor', () => {
  test.skip(
    reportsLandingHasNoClosedPeriod('monthly'),
    'the reports landing has no closed month yet this year'
  )

  test('starts, abandons and deletes a report, then completes it through to submission and unsubmission via backend @accreditedReprocessorFullFlow @accreditedReprocessorBackLinks @accreditedReprocessorDelete @accreditedReprocessorSave @deleteReport @incompleteReportBlockReprocessor @smoketest', async ({
    page
  }) => {
    test.setTimeout(JOURNEY_TIMEOUT_MS)

    const homePage = new HomePage(page)
    const reportsPage = new ReportsPage(page)
    const reportDetailPage = new ReportDetailPage(page)
    const tonnesRecycledPage = new TonnesRecycledPage(page)
    const tonnesNotRecycledPage = new TonnesNotRecycledPage(page)
    const reprocessorPrnSummaryPage = new ReprocessorPrnSummaryPage(page)
    const freePrnsPage = new FreePrnsPage(page)
    const reportSupportingInformationPage = new ReportSupportingInformationPage(
      page
    )
    const reportCheckAnswersPage = new ReportCheckAnswersPage(page)
    const confirmDeleteReportPage = new ConfirmDeleteReportPage(page)
    const confirmationPage = new ConfirmationPage(page)
    const monthlyReportDraftDeclarationPage =
      new MonthlyReportDraftDeclarationPage(page)
    const reportSubmittedPage = new ReportSubmittedPage(page)

    const setupResponse = await setupAccreditedReprocessor(page)
    await uploadAndNavigateToReports(
      page,
      setupResponse.organisationDetails,
      setupResponse.migrationResponse,
      setupResponse.user,
      setupResponse.numbers
    )

    // --- Delete from tonnes recycled page ---
    await reportsPage.selectActiveActionLink(1)
    await reportDetailPage.useThisData()

    await tonnesRecycledPage.deleteReportLink().click()

    expect(await confirmDeleteReportPage.headingText()).toBe(
      'Confirm deletion of this report'
    )
    await checkAccessibility(page, 'Confirm delete report')

    // Back link should return to tonnes-recycled
    await confirmDeleteReportPage.backLink().click()
    expect(await tonnesRecycledPage.headingText()).toBeTruthy()

    await tonnesRecycledPage.deleteReportLink().click()
    await confirmDeleteReportPage.confirmDeletion()

    // Back on reports list with status reverted to Due
    await reportsPage.expectListFor(currentYear())
    await expectActionRequiredStatus(page, 1)

    // --- Delete from PRN summary page ---
    await reportsPage.selectActiveActionLink(1)
    await reportDetailPage.useThisData()
    await tonnesRecycledPage.enterTonnage('15.02')
    await tonnesRecycledPage.continue()
    await tonnesNotRecycledPage.enterTonnage('89.31')
    await tonnesNotRecycledPage.continue()

    await reprocessorPrnSummaryPage.deleteReportLink().click()
    expect(await confirmDeleteReportPage.headingText()).toBe(
      'Confirm deletion of this report'
    )
    await confirmDeleteReportPage.confirmDeletion()

    await reportsPage.expectListFor(currentYear())
    await expectActionRequiredStatus(page, 1)

    // --- Submit an incomplete report ---
    // Starting the report creates it `in_progress` with null manual fields
    // (tonnageRecycled, tonnageNotRecycled, prn.totalRevenue, prn.freeTonnage).
    await reportsPage.selectActiveActionLink(1)
    await reportDetailPage.useThisData()

    // Navigate straight to check-your-answers, skipping every data-entry page.
    const reportUrl = page.url().replace(/(\/submissions\/\d+).*$/, '$1')
    await page.goto(`${reportUrl}/check-your-answers`)

    expect(await reportCheckAnswersPage.headingText()).toBe(
      'Check your answers before you create this draft report'
    )

    // Click "Create draft report" — BE returns 400, FE surfaces the generic
    // error page. The happy-path confirmation text is absent.
    await reportCheckAnswersPage.createReport()

    await checkBodyText(page, 'Bad request', 10)
    await checkBodyTextDoesNotInclude(page, 'report created', 10)

    // --- Delete and start again from check your answers ---
    await page.goto(`${reportUrl}/check-your-answers`)
    await reportCheckAnswersPage.deleteAndStartAgainLink().click()
    await confirmDeleteReportPage.confirmDeletion()

    await reportsPage.expectListFor(currentYear())
    await expectActionRequiredStatus(page, 1)

    // --- Back links and save-and-come-back-later through the wizard ---
    // Once started, the report is in_progress, so the action link routes
    // straight to tonnes-recycled, and its back link goes to the reports list.
    await reportsPage.selectActiveActionLink(1)
    await reportDetailPage.useThisData()
    await tonnesRecycledPage.backLink().click()
    await reportsPage.expectListFor(currentYear())

    await reportsPage.selectActiveActionLink(1)
    expect(await tonnesRecycledPage.headingText()).toBeTruthy()
    await checkAccessibility(page, 'Tonnes recycled')

    await tonnesRecycledPage.enterTonnage('15.02')
    await tonnesRecycledPage.saveAndComeBackLater()
    await reportsPage.expectListFor(currentYear())

    // Resume the report — lands on tonnes-recycled with the saved value
    await reportsPage.selectActiveActionLink(1)
    expect(await tonnesRecycledPage.headingText()).toBeTruthy()
    expect(await tonnesRecycledPage.getValue()).toBe('15.02')

    await tonnesRecycledPage.enterTonnage('15.02')
    await tonnesRecycledPage.continue()

    // --- Tonnes not recycled page — back link goes to tonnes-recycled ---
    expect(await tonnesNotRecycledPage.headingText()).toBeTruthy()
    await checkAccessibility(page, 'Tonnes not recycled')
    await tonnesNotRecycledPage.backLink().click()
    expect(await tonnesRecycledPage.headingText()).toBeTruthy()

    await tonnesRecycledPage.enterTonnage('15.02')
    await tonnesRecycledPage.continue()
    await tonnesNotRecycledPage.enterTonnage('89.31')
    await tonnesNotRecycledPage.continue()

    // --- PRN summary page — back link goes to tonnes-not-recycled ---
    expect(await reprocessorPrnSummaryPage.headingText()).toBeTruthy()
    await checkAccessibility(page, 'Reprocessor PRN summary')
    await reprocessorPrnSummaryPage.backLink().click()
    expect(await tonnesNotRecycledPage.headingText()).toBeTruthy()

    await tonnesNotRecycledPage.enterTonnage('89.31')
    await tonnesNotRecycledPage.continue()
    await reprocessorPrnSummaryPage.enterRevenue('1576.12')
    await reprocessorPrnSummaryPage.continue()

    // --- Free PRNs page — back link goes to prn-summary ---
    expect(await freePrnsPage.headingText()).toBeTruthy()
    await checkAccessibility(page, 'Free PRNs')
    await freePrnsPage.backLink().click()
    expect(await reprocessorPrnSummaryPage.headingText()).toBeTruthy()

    await reprocessorPrnSummaryPage.enterRevenue('1576.12')
    await reprocessorPrnSummaryPage.continue()
    await freePrnsPage.enterTonnage('0')
    await freePrnsPage.continue()

    // --- Supporting information page — back link goes to free-prns ---
    expect(await reportSupportingInformationPage.headingText()).toBe(
      'Add supporting information for your regulator (optional)'
    )
    await reportSupportingInformationPage.backLink().click()
    expect(await freePrnsPage.headingText()).toBeTruthy()

    await freePrnsPage.enterTonnage('0')
    await freePrnsPage.continue()
    await reportSupportingInformationPage.continue()

    // --- Check your answers page ---
    expect(await reportCheckAnswersPage.headingText()).toBe(
      'Check your answers before you create this draft report'
    )
    await expectPeriodYear(page, currentYear())

    // Verify data persists to CYA
    await checkBodyText(page, '15.02', 10)
    await checkBodyText(page, '89.31', 10)
    await checkBodyText(page, '1,576.12', 10)

    // Verify average price per tonne is calculated and displayed
    await checkBodyText(page, 'Average price per tonne', 10)

    await reportCheckAnswersPage.createReportAndCheckDoubleClickPrevented()

    await checkBodyText(page, 'report created', 30)

    // --- View draft report in new tab ---
    await confirmationPage.viewDraftReport().click()
    let newTab = await switchToNewTab(page)

    await checkBodyText(newTab, 'Draft report for', 10)
    await checkBodyText(newTab, 'Ready to submit', 10)
    await checkBodyText(newTab, 'Created by:', 10)
    await checkBodyText(newTab, 'Created on:', 10)
    await checkBodyText(newTab, 'Site', 10)
    await checkBodyText(newTab, 'Packaging waste received for reprocessing', 10)
    await checkBodyText(newTab, 'Packaging waste recycling', 10)
    await checkBodyText(newTab, 'Packaging waste sent on', 10)
    await checkBodyText(newTab, 'Supporting information', 10)

    await checkBodyText(newTab, '15.02', 5)
    await checkBodyText(newTab, '89.31', 5)

    await closeCurrentTabAndReturn(newTab)

    await confirmationPage.goToReports().click()

    // --- Delete from the submit page ---
    // The draft is ready to submit; deleting it from the submit page sends the
    // period back to Due, so the operator then creates it again to submit.
    expect(await reportsPage.getActiveStatusBadge(1)).toBe('Ready to submit')
    expect(await reportsPage.getActiveStatusColour(1)).toBe('blue')

    await reportsPage.selectActiveActionLink(1)
    await monthlyReportDraftDeclarationPage.deleteReport().click()

    expect(await confirmDeleteReportPage.headingText()).toBe(
      'Confirm deletion of this report'
    )
    expect(await confirmDeleteReportPage.warningText()).toContain(
      'This action cannot be undone'
    )

    await confirmDeleteReportPage.confirmDeletion()

    await reportsPage.expectListFor(currentYear())
    await expectActionRequiredStatus(page, 1)

    // --- Create the report again and submit it ---
    await reportsPage.selectActiveActionLink(1)
    await reportDetailPage.useThisData()
    await tonnesRecycledPage.enterTonnage('15.02')
    await tonnesRecycledPage.continue()
    await tonnesNotRecycledPage.enterTonnage('89.31')
    await tonnesNotRecycledPage.continue()
    await reprocessorPrnSummaryPage.enterRevenue('1576.12')
    await reprocessorPrnSummaryPage.continue()
    await freePrnsPage.enterTonnage('0')
    await freePrnsPage.continue()
    await reportSupportingInformationPage.continue()
    await reportCheckAnswersPage.createReport()
    await checkBodyText(page, 'report created', 30)

    await confirmationPage.goToReports().click()
    await reportsPage.expectListFor(currentYear())
    await reportsPage.selectActiveActionLink(1)

    await monthlyReportDraftDeclarationPage.submitAndCheckDoubleClickPrevented()

    const confirmationText = await reportSubmittedPage.confirmationText()
    expect(confirmationText).toContain('report submitted to regulator')

    await reportSubmittedPage.viewReportLink().click()
    newTab = await switchToNewTab(page)

    await checkBodyText(newTab, 'Report for', 10)
    await checkBodyText(newTab, 'Submitted', 10)
    await checkBodyText(newTab, 'Submitted by:', 10)
    await checkBodyText(newTab, 'Submitted on:', 10)
    await checkBodyText(newTab, 'Site', 10)
    await checkBodyText(newTab, 'Packaging waste received for reprocessing', 10)
    await checkBodyText(newTab, 'Packaging waste recycling', 10)
    await checkBodyText(newTab, 'Packaging waste sent on', 10)
    await checkBodyText(newTab, 'Supporting information', 10)

    await checkBodyText(newTab, '15.02', 5)
    await checkBodyText(newTab, '89.31', 5)

    await closeCurrentTabAndReturn(newTab)

    await reportSubmittedPage.returnToReportsLink().click()
    await reportsPage.expectListFor(currentYear())

    expect(await reportsPage.getSubmittedStatusBadge(1)).toBe('Submitted')
    expect(await reportsPage.getSubmittedStatusColour(1)).toBe('green')

    // Now we unsubmit the report via epr-backend to see the effects on the frontend
    await unsubmitReport(
      setupResponse.organisationDetails.refNo,
      setupResponse.migrationResponse.registrationIds[0],
      registrationStartYear(),
      'monthly',
      1,
      1
    )

    await page.reload()

    expect(await reportsPage.getActiveStatusBadge(1)).toBe('Ready to submit')
    expect(await reportsPage.getActiveStatusColour(1)).toBe('blue')

    await homePage.signOutLink().click()
    await expect(page).toHaveTitle(/Signed out/)
  })
})
