import { $, browser, expect } from '@wdio/globals'
import HomePage from 'page-objects/homepage.js'
import ConfirmationPage from 'page-objects/reports/confirmation.page.js'
import MonthlyReportDraftDeclarationPage from 'page-objects/reports/monthly.report.draft.declaration.page.js'
import ReportCheckAnswersPage from 'page-objects/reports/report.check.answers.page.js'
import ReportDetailPage from 'page-objects/reports/report.detail.page.js'
import ReportSubmittedPage from 'page-objects/reports/report.submitted.page.js'
import ReportSupportingInformationPage from 'page-objects/reports/report.supporting.information.page.js'
import ReportsPage from 'page-objects/reports/reports.page.js'
import ConfirmDeleteReportPage from '../page-objects/confirm.delete.report.page.js'
import TonnesNotExportedPage from '../page-objects/reports/tonnes.not.exported.page.js'
import seedOverseasSites, {
  createLinkedOrganisation,
  unsubmitReport,
  updateMigratedOrganisation
} from '../support/apicalls.js'
import {
  checkBodyText,
  checkBodyTextDoesNotInclude
} from '../support/checks.js'
import {
  closeCurrentTabAndReturn,
  switchToNewTab
} from '../support/windowtabs.js'
import { createLinkAndLogin } from '../support/login-helper.js'
import { uploadSummaryLogAndNavigateToReports } from '../support/report-navigation.js'

const REG_NUMBER = 'E25SR500030913PA'

async function uploadAndNavigateToReports() {
  await uploadSummaryLogAndNavigateToReports('resources/exporter-regonly.xlsx')
}

async function setupRegisteredOnlyExporter() {
  const organisationDetails = await createLinkedOrganisation([
    {
      material: 'Paper or board (R3)',
      wasteProcessingType: 'Exporter',
      withoutAccreditation: true
    }
  ])

  const migrationResponse = await updateMigratedOrganisation(
    organisationDetails.refNo,
    [
      {
        regNumber: REG_NUMBER,
        status: 'approved',
        withoutAccreditation: true
      }
    ]
  )

  await createLinkAndLogin(organisationDetails.refNo, migrationResponse.email)

  return { organisationDetails, migrationResponse }
}

describe('Registered-only exporter report flow @registeredOnlyExporter', () => {
  it('should complete the full registered-only exporter report flow through to confirmation @registeredOnlyExporterFullFlow', async () => {
    const setupResponse = await setupRegisteredOnlyExporter()

    await seedOverseasSites(
      setupResponse.organisationDetails.refNo,
      [0],
      [143, 297, 565, 893]
    )

    await uploadAndNavigateToReports()

    // Start the report — verify detail page buttons before proceeding
    await ReportsPage.selectActiveActionLink(1)
    await ReportDetailPage.verifyDetailPageButtons()

    await ReportsPage.selectActiveActionLink(1)
    await ReportDetailPage.useThisData()

    // --- Tonnes not exported page ---
    const tonnesNotExportedHeading = await TonnesNotExportedPage.headingText()
    expect(tonnesNotExportedHeading).toBeTruthy()

    await TonnesNotExportedPage.enterTonnage('5.50')
    await TonnesNotExportedPage.continue()

    // --- Supporting information page (no PERN pages for registered-only) ---
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

    // Verify tonnage not exported value and change link present on CYA
    await checkBodyText('5.50', 10)
    const changeLink = await $('a[href*="tonnes-not-exported"]')
    expect(await changeLink.isExisting()).toBe(true)

    // Verify NO PERN section present
    await checkBodyTextDoesNotInclude('PERN revenue', 5)
    await checkBodyTextDoesNotInclude('Free PERNs', 5)

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
    await checkBodyText('Packaging waste received for exporting', 10)
    await checkBodyText('Packaging waste exported for recycling', 10)
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
    await checkBodyText('Packaging waste received for exporting', 10)
    await checkBodyText('Packaging waste exported for recycling', 10)
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

  it('should return 404 when navigating directly to PERN pages @registeredOnlyExporterRouteGuard', async () => {
    const { organisationDetails, migrationResponse } =
      await setupRegisteredOnlyExporter()

    // Try to access prn-summary directly — should get 404
    await browser.url(
      `/organisations/${organisationDetails.refNo}/registrations/${migrationResponse.registrationIds[0]}/reports/2026/quarterly/1/submissions/1/prn-summary`
    )
    await checkBodyText('404', 10)
    await checkBodyText('Page not found', 10)

    // Try to access free-perns directly — should get 404
    await browser.url(
      `/organisations/${organisationDetails.refNo}/registrations/${migrationResponse.registrationIds[0]}/reports/2026/quarterly/1/submissions/1/free-perns`
    )
    await checkBodyText('404', 10)
    await checkBodyText('Page not found', 10)

    await HomePage.signOut()
    await expect(browser).toHaveTitle(expect.stringContaining('Signed out'))
  })

  it('should redirect to reports list when navigating back to check-answers after report is created @registeredOnlyExporterCheckAnswersGuard', async () => {
    await setupRegisteredOnlyExporter()
    await uploadAndNavigateToReports()

    // Complete the full flow through to confirmation
    await ReportsPage.selectActiveActionLink(1)
    await ReportDetailPage.useThisData()
    await TonnesNotExportedPage.enterTonnage('5.50')
    await TonnesNotExportedPage.continue()
    await ReportSupportingInformationPage.continue()
    await ReportCheckAnswersPage.createReport()
    await checkBodyText('report created', 30)

    // Navigate back to check-answers — the guard should redirect to the reports list
    await browser.back()

    const reportsHeading = await ReportsPage.headingText()
    expect(reportsHeading).toContain('Reports')

    await HomePage.signOut()
    await expect(browser).toHaveTitle(expect.stringContaining('Signed out'))
  })

  it('should redirect to submitted confirmation page when navigating back to submit after submission @registeredOnlyExporterSubmitGuard', async () => {
    await setupRegisteredOnlyExporter()
    await uploadAndNavigateToReports()

    // Complete the full flow through to submission
    await ReportsPage.selectActiveActionLink(1)
    await ReportDetailPage.useThisData()
    await TonnesNotExportedPage.enterTonnage('5.50')
    await TonnesNotExportedPage.continue()
    await ReportSupportingInformationPage.continue()
    await ReportCheckAnswersPage.createReport()
    await checkBodyText('report created', 30)
    await ConfirmationPage.goToReports()
    await ReportsPage.selectActiveActionLink(1)
    await MonthlyReportDraftDeclarationPage.confirmAndSubmit()
    await checkBodyText('report submitted to regulator', 30)

    // Navigate back to the submit page — the guard should redirect back to submitted
    await browser.back()

    const confirmationText = await ReportSubmittedPage.confirmationText()
    expect(confirmationText).toContain('report submitted to regulator')

    await HomePage.signOut()
    await expect(browser).toHaveTitle(expect.stringContaining('Signed out'))
  })

  it('should navigate back correctly through the registered-only exporter flow @registeredOnlyExporterBackLinks', async () => {
    await setupRegisteredOnlyExporter()
    await uploadAndNavigateToReports()

    await ReportsPage.selectActiveActionLink(1)
    await ReportDetailPage.useThisData()

    // On tonnes-not-exported — back link goes to reports list
    await TonnesNotExportedPage.selectBackLink()
    const reportsHeading = await ReportsPage.headingText()
    expect(reportsHeading).toContain('Reports')

    // Re-enter the wizard — report is in_progress so the action link
    // routes straight to tonnes-not-exported
    await ReportsPage.selectActiveActionLink(1)

    // Continue to tonnage not exported page
    await TonnesNotExportedPage.enterTonnage('5.50')

    await TonnesNotExportedPage.continue()

    // On supporting-information — back link goes to tonnes-not-exported (not free-perns)
    await ReportSupportingInformationPage.selectBackLink()
    const backToTonnesNotExported = await TonnesNotExportedPage.headingText()
    expect(backToTonnesNotExported).toBeTruthy()

    // Clean up
    await TonnesNotExportedPage.deleteReportLink()
    await ConfirmDeleteReportPage.confirmDeletion()

    await HomePage.signOut()
    await expect(browser).toHaveTitle(expect.stringContaining('Signed out'))
  })
})
