import { browser, expect } from '@wdio/globals'
import DefraIdStubPage from 'page-objects/defra.id.stub.page.js'
import HomePage from 'page-objects/homepage.js'
import DashboardPage from '../page-objects/dashboard.page.js'
import WasteRecordsPage from '../page-objects/waste.records.page.js'
import UploadSummaryLogPage from 'page-objects/upload.summary.log.page.js'
import ReportsPage from 'page-objects/reports/reports.page.js'
import ReportDetailPage from 'page-objects/reports/report.detail.page.js'
import TonnesRecycledPage from '../page-objects/reports/tonnes.recycled.page.js'
import TonnesNotRecycledPage from '../page-objects/reports/tonnes.not.recycled.page.js'
import ReportSupportingInformationPage from 'page-objects/reports/report.supporting.information.page.js'
import ReportCheckAnswersPage from 'page-objects/reports/report.check.answers.page.js'
import ConfirmDeleteReportPage from '../page-objects/confirm.delete.report.page.js'
import {
  createAndRegisterDefraIdUser,
  createLinkedOrganisation,
  linkDefraIdUser,
  unsubmitReport,
  updateMigratedOrganisation
} from '../support/apicalls.js'
import {
  checkBodyText,
  checkBodyTextDoesNotInclude
} from '../support/checks.js'
import ConfirmationPage from 'page-objects/reports/confirmation.page.js'
import {
  closeCurrentTabAndReturn,
  switchToNewTab
} from '../support/windowtabs.js'
import MonthlyReportDraftDeclarationPage from 'page-objects/reports/monthly.report.draft.declaration.page.js'
import ReportSubmittedPage from 'page-objects/reports/report.submitted.page.js'

const REG_NUMBER = 'R25SR5111050912PA'

async function startAndSubmitReport() {
  await ReportsPage.selectActiveActionLink(1)
  await ReportDetailPage.useThisData()
  await TonnesRecycledPage.enterTonnage('12.50')
  await TonnesRecycledPage.continue()
  await TonnesNotRecycledPage.enterTonnage('7.50')
  await TonnesNotRecycledPage.continue()
  await ReportSupportingInformationPage.continue()
  await ReportCheckAnswersPage.createReport()
  await checkBodyText('report created', 30)
}

async function uploadAndNavigateToReports() {
  await DashboardPage.selectTableLink(1, 1)
  await WasteRecordsPage.submitSummaryLogLink()
  await UploadSummaryLogPage.performUploadAndReturnToHomepage(
    'resources/reprocessor-output-regonly.xlsx'
  )
  await DashboardPage.selectTableLink(1, 1)
  await WasteRecordsPage.manageReportsLink()
}

async function setupRegisteredOnlyReprocessor() {
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

  const user = await createAndRegisterDefraIdUser(migrationResponse.email)
  await linkDefraIdUser(
    organisationDetails.refNo,
    user.userId,
    migrationResponse.email
  )

  await HomePage.openStart()
  await HomePage.clickStartNow()
  await DefraIdStubPage.loginViaEmail(migrationResponse.email)

  return { organisationDetails, migrationResponse }
}

describe('Registered-only reprocessor report flow @registeredOnlyReprocessor', () => {
  it('should complete the full registered-only reprocessor report flow through to confirmation @registeredOnlyReprocessorFullFlow', async () => {
    const setupResponse = await setupRegisteredOnlyReprocessor()
    await uploadAndNavigateToReports()

    // Start the report — verify detail page buttons before proceeding
    await ReportsPage.selectActiveActionLink(1)
    await ReportDetailPage.verifyDetailPageButtons()

    await ReportsPage.selectActiveActionLink(1)
    await checkBodyText(REG_NUMBER, 10)
    await ReportDetailPage.useThisData()

    // --- Tonnes recycled page ---
    const tonnesRecycledHeading = await TonnesRecycledPage.headingText()
    expect(tonnesRecycledHeading).toBeTruthy()

    await TonnesRecycledPage.enterTonnage('12.50')
    await TonnesRecycledPage.continue()

    // --- Tonnes not recycled page ---
    const tonnesNotRecycledHeading = await TonnesNotRecycledPage.headingText()
    expect(tonnesNotRecycledHeading).toBeTruthy()

    await TonnesNotRecycledPage.enterTonnage('7.50')
    await TonnesNotRecycledPage.continue()

    // --- Supporting information page (no PRN pages for registered-only) ---
    const supportingInfoHeading =
      await ReportSupportingInformationPage.headingText()
    expect(supportingInfoHeading).toBe(
      'Add supporting information for your regulator (optional)'
    )
    await ReportSupportingInformationPage.continue()

    // --- Check your answers page ---
    const checkHeading = await ReportCheckAnswersPage.headingText()
    expect(checkHeading).toBe(
      'Check your answers before you create this draft report'
    )

    // Verify recycling activity values displayed (rendered without formatTonnage, so no trailing zero)
    await checkBodyText('12.5', 10)
    await checkBodyText('7.5', 10)

    // Verify NO PRN section present
    await checkBodyTextDoesNotInclude('PRN revenue', 5)
    await checkBodyTextDoesNotInclude('Free PRNs', 5)
    await checkBodyTextDoesNotInclude('Average price per tonne', 5)

    // Submit the report
    await ReportCheckAnswersPage.createReport()

    // Verify confirmation page
    await checkBodyText('report created', 30)

    // --- View draft report in new tab ---
    await ConfirmationPage.viewDraftReport()
    let originalTab = await switchToNewTab()

    // Verify draft report page content
    await checkBodyText('Draft report for Quarter', 10)
    await checkBodyText('Ready to submit', 10)
    await checkBodyText('Created by:', 10)
    await checkBodyText('Created on:', 10)
    await checkBodyText('Site', 10)
    await checkBodyText('Packaging waste received for reprocessing', 10)
    await checkBodyText('Packaging waste recycling', 10)
    await checkBodyText('Packaging waste sent on', 10)
    await checkBodyText('Supporting information', 10)

    // Close draft tab and return to confirmation page
    await closeCurrentTabAndReturn(originalTab)

    await ConfirmationPage.goToReports()
    await ReportsPage.selectActiveActionLink(1)

    // Confirm and submit report
    await MonthlyReportDraftDeclarationPage.confirmAndSubmit()

    const confirmationText = await ReportSubmittedPage.confirmationText()
    expect(confirmationText).toContain('report submitted to regulator')

    await ReportSubmittedPage.viewReportLink()
    originalTab = await switchToNewTab()

    await checkBodyText('Report for Quarter', 10)
    await checkBodyText('Submitted', 10)
    await checkBodyText('Submitted by:', 10)
    await checkBodyText('Submitted on:', 10)
    await checkBodyText('Site', 10)
    await checkBodyText('Packaging waste received for reprocessing', 10)
    await checkBodyText('Packaging waste recycling', 10)
    await checkBodyText('Packaging waste sent on', 10)
    await checkBodyText('Supporting information', 10)

    // Close report tab and return to submission confirmation page
    await closeCurrentTabAndReturn(originalTab)

    await ReportSubmittedPage.returnToReportsLink()

    const submittedBadge = await ReportsPage.getSubmittedStatusBadge(1)
    const submittedColour = await ReportsPage.getSubmittedStatusColour(1)

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
    await browser.refresh()

    const unsubmittedBadge = await ReportsPage.getActiveStatusBadge(1)
    const unsubmittedColour = await ReportsPage.getActiveStatusColour(1)

    expect(unsubmittedBadge).toBe('Ready to submit')
    expect(unsubmittedColour).toBe('blue')

    await HomePage.signOut()
    await expect(browser).toHaveTitle(expect.stringContaining('Signed out'))
  })

  it('should return 404 when navigating directly to PRN pages @registeredOnlyReprocessorRouteGuard', async () => {
    const { organisationDetails, migrationResponse } =
      await setupRegisteredOnlyReprocessor()

    // Try to access prn-summary directly — should get 404
    await browser.url(
      `/organisations/${organisationDetails.refNo}/registrations/${migrationResponse.registrationIds[0]}/reports/2026/quarterly/1/submissions/1/prn-summary`
    )
    await checkBodyText('404', 10)
    await checkBodyText('Page not found', 10)

    // Try to access free-prns directly — should get 404
    await browser.url(
      `/organisations/${organisationDetails.refNo}/registrations/${migrationResponse.registrationIds[0]}/reports/2026/quarterly/1/submissions/1/free-prns`
    )
    await checkBodyText('404', 10)
    await checkBodyText('Page not found', 10)

    await HomePage.signOut()
    await expect(browser).toHaveTitle(expect.stringContaining('Signed out'))
  })

  it('should redirect to reports list when navigating back to check-answers after report is created @registeredOnlyReprocessorCheckAnswersGuard', async () => {
    await setupRegisteredOnlyReprocessor()
    await uploadAndNavigateToReports()
    await startAndSubmitReport()

    // Navigate back to check-answers — the guard should redirect to the reports list
    await browser.back()

    const reportsHeading = await ReportsPage.headingText()
    expect(reportsHeading).toContain('Reports')

    await HomePage.signOut()
    await expect(browser).toHaveTitle(expect.stringContaining('Signed out'))
  })

  it('should navigate back correctly through the registered-only reprocessor flow @registeredOnlyReprocessorBackLinks', async () => {
    await setupRegisteredOnlyReprocessor()
    await uploadAndNavigateToReports()

    await ReportsPage.selectActiveActionLink(1)
    await ReportDetailPage.useThisData()

    // On tonnes-recycled — back link goes to reports list
    await TonnesRecycledPage.selectBackLink()
    const reportsHeading = await ReportsPage.headingText()
    expect(reportsHeading).toContain('Reports')

    // Re-enter the wizard — report is in_progress so the action link
    // routes straight to tonnes-recycled
    await ReportsPage.selectActiveActionLink(1)

    // Continue to tonnes-not-recycled
    await TonnesRecycledPage.enterTonnage('12.50')
    await TonnesRecycledPage.continue()

    // On tonnes-not-recycled — back link goes to tonnes-recycled
    await TonnesNotRecycledPage.selectBackLink()
    const backToTonnesRecycled = await TonnesRecycledPage.headingText()
    expect(backToTonnesRecycled).toBeTruthy()

    // Continue to supporting-information (skips PRN pages)
    await TonnesRecycledPage.enterTonnage('12.50')
    await TonnesRecycledPage.continue()
    await TonnesNotRecycledPage.enterTonnage('7.50')
    await TonnesNotRecycledPage.continue()

    // On supporting-information — back link goes to tonnes-not-recycled (not free-prns)
    await ReportSupportingInformationPage.selectBackLink()
    const backToTonnesNotRecycled = await TonnesNotRecycledPage.headingText()
    expect(backToTonnesNotRecycled).toBeTruthy()

    // Clean up
    await TonnesNotRecycledPage.deleteReportLink()
    await ConfirmDeleteReportPage.confirmDeletion()

    await HomePage.signOut()
    await expect(browser).toHaveTitle(expect.stringContaining('Signed out'))
  })
})
