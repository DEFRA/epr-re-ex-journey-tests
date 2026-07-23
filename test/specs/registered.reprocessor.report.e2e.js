import { test, expect } from '@playwright/test'
import { HomePage } from 'page-objects/homepage.js'
import { ReportsPage } from 'page-objects/reports/reports.page.js'
import { ReportDetailPage } from 'page-objects/reports/report.detail.page.js'
import { TonnesRecycledPage } from '../page-objects/reports/tonnes.recycled.page.js'
import { TonnesNotRecycledPage } from '../page-objects/reports/tonnes.not.recycled.page.js'
import { ReportSupportingInformationPage } from 'page-objects/reports/report.supporting.information.page.js'
import { ReportCheckAnswersPage } from 'page-objects/reports/report.check.answers.page.js'
import { ConfirmDeleteReportPage } from '../page-objects/confirm.delete.report.page.js'
import {
  createLinkedOrganisation,
  unsubmitReport,
  updateMigratedOrganisation
} from '../support/apicalls.js'
import { createLinkAndLogin } from '../support/login-helper.js'
import { uploadSummaryLogAndNavigateToReports } from '../support/report-navigation.js'
import {
  checkBodyText,
  checkBodyTextDoesNotInclude
} from '../support/checks.js'
import { ConfirmationPage } from 'page-objects/reports/confirmation.page.js'
import {
  closeCurrentTabAndReturn,
  switchToNewTab
} from '../support/windowtabs.js'
import { MonthlyReportDraftDeclarationPage } from 'page-objects/reports/monthly.report.draft.declaration.page.js'
import { ReportSubmittedPage } from 'page-objects/reports/report.submitted.page.js'

const REG_NUMBER = 'R25SR5111050912PA'

async function startAndSubmitReport(page) {
  const reportsPage = new ReportsPage(page)
  const reportDetailPage = new ReportDetailPage(page)
  const tonnesRecycledPage = new TonnesRecycledPage(page)
  const tonnesNotRecycledPage = new TonnesNotRecycledPage(page)
  const reportSupportingInformationPage = new ReportSupportingInformationPage(
    page
  )
  const reportCheckAnswersPage = new ReportCheckAnswersPage(page)

  await reportsPage.selectActiveActionLink(1)
  await reportDetailPage.useThisData()
  await tonnesRecycledPage.enterTonnage('12.50')
  await tonnesRecycledPage.continue()
  await tonnesNotRecycledPage.enterTonnage('7.50')
  await tonnesNotRecycledPage.continue()
  await reportSupportingInformationPage.continue()
  await reportCheckAnswersPage.createReport()
  await checkBodyText(page, 'report created', 30)
}

async function uploadAndNavigateToReports(page) {
  await uploadSummaryLogAndNavigateToReports(
    page,
    'resources/reprocessor-output-regonly.xlsx'
  )
}

async function setupRegisteredOnlyReprocessor(page) {
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
        regNumber: REG_NUMBER,
        status: 'approved',
        withoutAccreditation: true
      }
    ]
  )

  await createLinkAndLogin(
    page,
    organisationDetails.refNo,
    migrationResponse.email
  )

  return { organisationDetails, migrationResponse }
}

test.describe('Registered-only reprocessor report flow @registeredOnlyReprocessor', () => {
  test('should complete the full registered-only reprocessor report flow through to confirmation @registeredOnlyReprocessorFullFlow', async ({
    page
  }) => {
    const homePage = new HomePage(page)
    const reportsPage = new ReportsPage(page)
    const reportDetailPage = new ReportDetailPage(page)
    const tonnesRecycledPage = new TonnesRecycledPage(page)
    const tonnesNotRecycledPage = new TonnesNotRecycledPage(page)
    const reportSupportingInformationPage = new ReportSupportingInformationPage(
      page
    )
    const reportCheckAnswersPage = new ReportCheckAnswersPage(page)
    const confirmationPage = new ConfirmationPage(page)
    const monthlyReportDraftDeclarationPage =
      new MonthlyReportDraftDeclarationPage(page)
    const reportSubmittedPage = new ReportSubmittedPage(page)

    const setupResponse = await setupRegisteredOnlyReprocessor(page)
    await uploadAndNavigateToReports(page)

    // Start the report — verify detail page buttons before proceeding
    await reportsPage.selectActiveActionLink(1)
    await reportDetailPage.verifyDetailPageButtons()

    await reportsPage.selectActiveActionLink(1)
    await checkBodyText(page, REG_NUMBER, 10)
    await reportDetailPage.useThisData()

    // --- Tonnes recycled page ---
    const tonnesRecycledHeading = await tonnesRecycledPage.headingText()
    expect(tonnesRecycledHeading).toBeTruthy()

    await tonnesRecycledPage.enterTonnage('12.50')
    await tonnesRecycledPage.continue()

    // --- Tonnes not recycled page ---
    const tonnesNotRecycledHeading = await tonnesNotRecycledPage.headingText()
    expect(tonnesNotRecycledHeading).toBeTruthy()

    await tonnesNotRecycledPage.enterTonnage('7.50')
    await tonnesNotRecycledPage.continue()

    // --- Supporting information page (no PRN pages for registered-only) ---
    const supportingInfoHeading =
      await reportSupportingInformationPage.headingText()
    expect(supportingInfoHeading).toBe(
      'Add supporting information for your regulator (optional)'
    )
    await reportSupportingInformationPage.continue()

    // --- Check your answers page ---
    const checkHeading = await reportCheckAnswersPage.headingText()
    expect(checkHeading).toBe(
      'Check your answers before you create this draft report'
    )

    // Verify recycling activity values displayed (rendered without formatTonnage, so no trailing zero)
    await checkBodyText(page, '12.5', 10)
    await checkBodyText(page, '7.5', 10)

    // Verify NO PRN section present
    await checkBodyTextDoesNotInclude(page, 'PRN revenue', 5)
    await checkBodyTextDoesNotInclude(page, 'Free PRNs', 5)
    await checkBodyTextDoesNotInclude(page, 'Average price per tonne', 5)

    // Submit the report
    await reportCheckAnswersPage.createReport()

    // Verify confirmation page
    await checkBodyText(page, 'report created', 30)

    // --- View draft report in new tab ---
    await confirmationPage.viewDraftReport()
    let newTab = await switchToNewTab(page)

    // Verify draft report page content
    await checkBodyText(newTab, 'Draft report for Quarter', 10)
    await checkBodyText(newTab, 'Ready to submit', 10)
    await checkBodyText(newTab, 'Created by:', 10)
    await checkBodyText(newTab, 'Created on:', 10)
    await checkBodyText(newTab, 'Site', 10)
    await checkBodyText(newTab, 'Packaging waste received for reprocessing', 10)
    await checkBodyText(newTab, 'Packaging waste recycling', 10)
    await checkBodyText(newTab, 'Packaging waste sent on', 10)
    await checkBodyText(newTab, 'Supporting information', 10)

    // Close draft tab and return to confirmation page
    await closeCurrentTabAndReturn(newTab)

    await confirmationPage.goToReports()
    await reportsPage.selectActiveActionLink(1)

    // Confirm and submit report
    await monthlyReportDraftDeclarationPage.confirmAndSubmit()

    const confirmationText = await reportSubmittedPage.confirmationText()
    expect(confirmationText).toContain('report submitted to regulator')

    await reportSubmittedPage.viewReportLink()
    newTab = await switchToNewTab(page)

    await checkBodyText(newTab, 'Report for Quarter', 10)
    await checkBodyText(newTab, 'Submitted', 10)
    await checkBodyText(newTab, 'Submitted by:', 10)
    await checkBodyText(newTab, 'Submitted on:', 10)
    await checkBodyText(newTab, 'Site', 10)
    await checkBodyText(newTab, 'Packaging waste received for reprocessing', 10)
    await checkBodyText(newTab, 'Packaging waste recycling', 10)
    await checkBodyText(newTab, 'Packaging waste sent on', 10)
    await checkBodyText(newTab, 'Supporting information', 10)

    // Close report tab and return to submission confirmation page
    await closeCurrentTabAndReturn(newTab)

    await reportSubmittedPage.returnToReportsLink()

    const submittedBadge = await reportsPage.getSubmittedStatusBadge(1)
    const submittedColour = await reportsPage.getSubmittedStatusColour(1)

    expect(submittedBadge).toBe('Submitted')
    expect(submittedColour).toBe('green')

    // Now we unsubmit the report via epr-backend to see the effects on the frontend
    await unsubmitReport(
      setupResponse.organisationDetails.refNo,
      setupResponse.migrationResponse.registrationIds[0],
      2026,
      'quarterly',
      1,
      1
    )

    // Refresh to see the status change
    await page.reload()

    const unsubmittedBadge = await reportsPage.getActiveStatusBadge(1)
    const unsubmittedColour = await reportsPage.getActiveStatusColour(1)

    expect(unsubmittedBadge).toBe('Ready to submit')
    expect(unsubmittedColour).toBe('blue')

    await homePage.signOut()
    await expect(page).toHaveTitle(/Signed out/)
  })

  test('should return 404 when navigating directly to PRN pages @registeredOnlyReprocessorRouteGuard', async ({
    page
  }) => {
    const homePage = new HomePage(page)
    const { organisationDetails, migrationResponse } =
      await setupRegisteredOnlyReprocessor(page)

    // Try to access prn-summary directly — should get 404
    await page.goto(
      `/organisations/${organisationDetails.refNo}/registrations/${migrationResponse.registrationIds[0]}/reports/2026/quarterly/1/submissions/1/prn-summary`
    )
    await checkBodyText(page, '404', 10)
    await checkBodyText(page, 'Page not found', 10)

    // Try to access free-prns directly — should get 404
    await page.goto(
      `/organisations/${organisationDetails.refNo}/registrations/${migrationResponse.registrationIds[0]}/reports/2026/quarterly/1/submissions/1/free-prns`
    )
    await checkBodyText(page, '404', 10)
    await checkBodyText(page, 'Page not found', 10)

    await homePage.signOut()
    await expect(page).toHaveTitle(/Signed out/)
  })

  test('should redirect to reports list when navigating back to check-answers after report is created @registeredOnlyReprocessorCheckAnswersGuard', async ({
    page
  }) => {
    const homePage = new HomePage(page)
    const reportsPage = new ReportsPage(page)

    await setupRegisteredOnlyReprocessor(page)
    await uploadAndNavigateToReports(page)
    await startAndSubmitReport(page)

    // Navigate back to check-answers — the guard should redirect to the reports list
    await page.goBack()

    const reportsHeading = await reportsPage.headingText()
    expect(reportsHeading).toContain('Reports')

    await homePage.signOut()
    await expect(page).toHaveTitle(/Signed out/)
  })

  test('should navigate back correctly through the registered-only reprocessor flow @registeredOnlyReprocessorBackLinks', async ({
    page
  }) => {
    const homePage = new HomePage(page)
    const reportsPage = new ReportsPage(page)
    const reportDetailPage = new ReportDetailPage(page)
    const tonnesRecycledPage = new TonnesRecycledPage(page)
    const tonnesNotRecycledPage = new TonnesNotRecycledPage(page)
    const reportSupportingInformationPage = new ReportSupportingInformationPage(
      page
    )
    const confirmDeleteReportPage = new ConfirmDeleteReportPage(page)

    await setupRegisteredOnlyReprocessor(page)
    await uploadAndNavigateToReports(page)

    await reportsPage.selectActiveActionLink(1)
    await reportDetailPage.useThisData()

    // On tonnes-recycled — back link goes to reports list
    await tonnesRecycledPage.selectBackLink()
    const reportsHeading = await reportsPage.headingText()
    expect(reportsHeading).toContain('Reports')

    // Re-enter the wizard — report is in_progress so the action link
    // routes straight to tonnes-recycled
    await reportsPage.selectActiveActionLink(1)

    // Continue to tonnes-not-recycled
    await tonnesRecycledPage.enterTonnage('12.50')
    await tonnesRecycledPage.continue()

    // On tonnes-not-recycled — back link goes to tonnes-recycled
    await tonnesNotRecycledPage.selectBackLink()
    const backToTonnesRecycled = await tonnesRecycledPage.headingText()
    expect(backToTonnesRecycled).toBeTruthy()

    // Continue to supporting-information (skips PRN pages)
    await tonnesRecycledPage.enterTonnage('12.50')
    await tonnesRecycledPage.continue()
    await tonnesNotRecycledPage.enterTonnage('7.50')
    await tonnesNotRecycledPage.continue()

    // On supporting-information — back link goes to tonnes-not-recycled (not free-prns)
    await reportSupportingInformationPage.selectBackLink()
    const backToTonnesNotRecycled = await tonnesNotRecycledPage.headingText()
    expect(backToTonnesNotRecycled).toBeTruthy()

    // Clean up
    await tonnesNotRecycledPage.deleteReportLink()
    await confirmDeleteReportPage.confirmDeletion()

    await homePage.signOut()
    await expect(page).toHaveTitle(/Signed out/)
  })
})
