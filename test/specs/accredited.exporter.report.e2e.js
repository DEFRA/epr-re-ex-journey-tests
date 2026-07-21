import { browser, expect } from '@wdio/globals'
import HomePage from 'page-objects/homepage.js'
import DashboardPage from '../page-objects/dashboard.page.js'
import WasteRecordsPage from '../page-objects/waste.records.page.js'
import UploadSummaryLogPage from 'page-objects/upload.summary.log.page.js'
import ReportsPage from 'page-objects/reports/reports.page.js'
import ReportDetailPage from 'page-objects/reports/report.detail.page.js'
import PrnSummaryPage from '../page-objects/reports/prn.summary.page.js'
import FreePernPage from '../page-objects/reports/free.perns.page.js'
import ReportSupportingInformationPage from 'page-objects/reports/report.supporting.information.page.js'
import ReportCheckAnswersPage from 'page-objects/reports/report.check.answers.page.js'
import ConfirmDeleteReportPage from '../page-objects/confirm.delete.report.page.js'
import {
  seedOverseasSites,
  createLinkedOrganisation,
  unsubmitReport,
  updateMigratedOrganisation
} from '../support/apicalls.js'
import { checkBodyText } from '../support/checks.js'
import { createLinkAndLogin } from '../support/login-helper.js'
import ConfirmationPage from '../page-objects/reports/confirmation.page.js'
import {
  switchToNewTab,
  closeCurrentTabAndReturn
} from '../support/windowtabs.js'
import { expectActionRequiredStatus } from '../support/report-status.js'
import MonthlyReportDraftDeclarationPage from 'page-objects/reports/monthly.report.draft.declaration.page.js'
import ReportSubmittedPage from 'page-objects/reports/report.submitted.page.js'

describe('Accredited exporter report flow @accreditedExporter', () => {
  describe('accredited exporter with upload', () => {
    let organisationDetails
    let migrationResponse
    before(async () => {
      const regNumber = 'E25SR500020912PA'
      const accNumber = 'E-ACC12245PA'

      organisationDetails = await createLinkedOrganisation([
        {
          material: 'Paper or board (R3)',
          wasteProcessingType: 'Exporter'
        }
      ])

      migrationResponse = await updateMigratedOrganisation(
        organisationDetails.refNo,
        [
          {
            regNumber,
            accNumber,
            status: 'approved'
          }
        ]
      )

      await seedOverseasSites(organisationDetails.refNo)

      await createLinkAndLogin(
        organisationDetails.refNo,
        migrationResponse.email
      )

      // Upload summary log so report data exists
      await DashboardPage.selectTableLink(1, 1)
      await WasteRecordsPage.submitSummaryLogLink()

      const filePath = `resources/sanity/exporter_${accNumber}_${regNumber}.xlsx`
      await UploadSummaryLogPage.performUploadAndReturnToHomepage(filePath)

      // Navigate to reports — all tests start from the Reports page
      await DashboardPage.selectTableLink(1, 1)
      await WasteRecordsPage.manageReportsLink()
    })

    after(async () => {
      await HomePage.signOut()
      await expect(browser).toHaveTitle(expect.stringContaining('Signed out'))
    })

    it('should display upload new summary log button and cancel link on detail page @accreditedExporterDetailButtons', async () => {
      await ReportsPage.selectActiveActionLink(1)
      await ReportDetailPage.verifyDetailPageButtons()
    })

    it('should navigate back correctly through the accredited exporter flow @accreditedExporterBackLinks', async () => {
      await ReportsPage.selectActiveActionLink(1)
      await ReportDetailPage.useThisData()

      // On prn-summary — back link goes to reports list
      await PrnSummaryPage.selectBackLink()
      const reportsHeading = await ReportsPage.headingText()
      expect(reportsHeading).toContain('Reports')

      // Re-enter the wizard — report is in_progress so the action link
      // routes straight to prn-summary
      await ReportsPage.selectActiveActionLink(1)

      // Continue to free-perns
      await PrnSummaryPage.enterRevenue('100')
      await PrnSummaryPage.continue()

      // On free-perns — back link goes to prn-summary
      await FreePernPage.selectBackLink()
      const backToPrnSummary = await PrnSummaryPage.headingText()
      expect(backToPrnSummary).toBeTruthy()

      // Continue through to supporting info
      await PrnSummaryPage.enterRevenue('100')
      await PrnSummaryPage.continue()
      await FreePernPage.enterTonnage('0')
      await FreePernPage.continue()

      // On supporting info — back link goes to free-perns
      await ReportSupportingInformationPage.selectBackLink()
      const backToFreePern = await FreePernPage.headingText()
      expect(backToFreePern).toBeTruthy()

      // Clean up — delete report so next test starts fresh
      await FreePernPage.deleteReportLink()
      await ConfirmDeleteReportPage.confirmDeletion()
    })

    it('should navigate to delete confirmation from PRN summary and free PERNs pages @accreditedExporterDelete', async () => {
      await ReportsPage.selectActiveActionLink(1)
      await ReportDetailPage.useThisData()

      // --- Delete from PRN summary page ---
      await PrnSummaryPage.deleteReportLink()

      const deleteHeading = await ConfirmDeleteReportPage.headingText()
      expect(deleteHeading).toBe('Confirm deletion of this report')

      // Back link should return to prn-summary
      await ConfirmDeleteReportPage.selectBackLink()
      const backToPrnSummary = await PrnSummaryPage.headingText()
      expect(backToPrnSummary).toBeTruthy()

      // Confirm deletion
      await PrnSummaryPage.deleteReportLink()
      await ConfirmDeleteReportPage.confirmDeletion()

      // Should be back on reports list with status reverted to Due
      let reportsHeading = await ReportsPage.headingText()
      expect(reportsHeading).toContain('Reports')

      await expectActionRequiredStatus(1)

      // --- Create report again, navigate to free-perns, delete from there ---
      await ReportsPage.selectActiveActionLink(1)
      await ReportDetailPage.useThisData()
      await PrnSummaryPage.enterRevenue('100')
      await PrnSummaryPage.continue()

      await FreePernPage.deleteReportLink()

      const deleteHeading2 = await ConfirmDeleteReportPage.headingText()
      expect(deleteHeading2).toBe('Confirm deletion of this report')

      await ConfirmDeleteReportPage.confirmDeletion()

      // Should be back on reports list with status reverted to Due
      reportsHeading = await ReportsPage.headingText()
      expect(reportsHeading).toContain('Reports')

      await expectActionRequiredStatus(1)
    })

    it('should save and come back later from PRN summary and free PERNs pages @accreditedExporterSave', async () => {
      await ReportsPage.selectActiveActionLink(1)
      await ReportDetailPage.useThisData()

      // --- Save from PRN summary page ---
      await PrnSummaryPage.enterRevenue('500')
      await PrnSummaryPage.saveAndComeBackLater()

      // Should redirect back to reports list
      const reportsHeading = await ReportsPage.headingText()
      expect(reportsHeading).toContain('Reports')

      // Resume the report — Continue goes directly to prn-summary for accredited exporters
      await ReportsPage.selectActiveActionLink(1)

      // Continue past prn-summary to free-perns
      await PrnSummaryPage.enterRevenue('500')
      await PrnSummaryPage.continue()

      // --- Save from free PERNs page ---
      await FreePernPage.enterTonnage('0')
      await FreePernPage.saveAndComeBackLater()

      // Should redirect back to reports list
      const reportsHeadingAfterSave = await ReportsPage.headingText()
      expect(reportsHeadingAfterSave).toContain('Reports')

      // Clean up — delete the report (Continue goes directly to prn-summary)
      await ReportsPage.selectActiveActionLink(1)
      await PrnSummaryPage.deleteReportLink()
      await ConfirmDeleteReportPage.confirmDeletion()
    })

    it('should complete the full accredited exporter report flow through to confirmation @accreditedExporterFullFlow @smoketest', async () => {
      await ReportsPage.selectActiveActionLink(1)
      await ReportDetailPage.useThisData()

      // --- PRN Summary page ---
      const prnSummaryHeading = await PrnSummaryPage.headingText()
      expect(prnSummaryHeading).toBeTruthy()

      // Enter revenue
      await PrnSummaryPage.enterRevenue('1500.50')
      await PrnSummaryPage.continue()

      // --- Free PERNs page ---
      const freePernHeading = await FreePernPage.headingText()
      expect(freePernHeading).toBeTruthy()

      // Enter free PERN tonnage (must be <= issued tonnage)
      await FreePernPage.enterTonnage('0')
      await FreePernPage.continue()

      // --- Supporting information page ---
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

      // Verify PRN revenue persists to CYA
      await checkBodyText('1,500.50', 10)

      // Submit the report
      await ReportCheckAnswersPage.createReport()

      // Verify confirmation page
      await checkBodyText('report created', 30)

      // --- View draft report in new tab ---
      await ConfirmationPage.viewDraftReport()
      let originalTab = await switchToNewTab()

      // Verify draft report page content
      await checkBodyText('Draft report for', 10)
      await checkBodyText('Ready to submit', 10)
      await checkBodyText('Created by:', 10)
      await checkBodyText('Created on:', 10)
      await checkBodyText('Packaging waste received for exporting', 10)
      await checkBodyText('Packaging waste exported for recycling', 10)
      await checkBodyText('Packaging waste sent on', 10)
      await checkBodyText('Supporting information', 10)

      // Close draft tab and return to confirmation page
      await closeCurrentTabAndReturn(originalTab)

      // Report is now ready_to_submit. Navigating back to check-answers
      // should redirect to the reports list, not show the form again.
      await browser.back()

      const reportsHeading = await ReportsPage.headingText()
      expect(reportsHeading).toContain('Reports')

      const readyStatusBadge = await ReportsPage.getActiveStatusBadge(1)
      const readyStatusColour = await ReportsPage.getActiveStatusColour(1)

      expect(readyStatusBadge).toBe('Ready to submit')
      expect(readyStatusColour).toBe('blue')

      await ReportsPage.selectActiveActionLink(1)

      // Confirm and submit report
      await MonthlyReportDraftDeclarationPage.confirmAndSubmit()

      const confirmationText = await ReportSubmittedPage.confirmationText()
      expect(confirmationText).toContain('report submitted to regulator')

      await ReportSubmittedPage.viewReportLink()
      originalTab = await switchToNewTab()

      await checkBodyText('Report for', 10)
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
        organisationDetails.refNo,
        migrationResponse.registrationIds[0],
        2026,
        'monthly',
        1,
        1
      )

      // Refresh to see the status change
      await browser.refresh()

      const unsubmittedBadge = await ReportsPage.getActiveStatusBadge(1)
      const unsubmittedColour = await ReportsPage.getActiveStatusColour(1)

      expect(unsubmittedBadge).toBe('Ready to submit')
      expect(unsubmittedColour).toBe('blue')
    })
  })

  describe('non-accredited exporter route guards', () => {
    let orgRefNo
    let registrationId

    before(async () => {
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
            regNumber: 'E25SR500050912PA',
            status: 'approved',
            withoutAccreditation: true
          }
        ]
      )

      orgRefNo = organisationDetails.refNo
      registrationId = migrationResponse.registrationIds[0]

      await createLinkAndLogin(orgRefNo, migrationResponse.email)
    })

    after(async () => {
      await HomePage.signOut()
      await expect(browser).toHaveTitle(expect.stringContaining('Signed out'))
    })

    it('should return 404 when non-accredited exporter tries to access PRN pages @accreditedExporterRouteGuard', async () => {
      // Try to access prn-summary directly — should get 404
      await browser.url(
        `/organisations/${orgRefNo}/registrations/${registrationId}/reports/2026/monthly/1/submissions/1/prn-summary`
      )
      await checkBodyText('404', 10)
      await checkBodyText('Page not found', 10)

      // Try to access free-perns directly — should get 404
      await browser.url(
        `/organisations/${orgRefNo}/registrations/${registrationId}/reports/2026/monthly/1/submissions/1/free-perns`
      )
      await checkBodyText('404', 10)
      await checkBodyText('Page not found', 10)
    })

    it('should return 404 when registered-only exporter tries to access PRN pages @registeredOnlyExporterRegression', async () => {
      // Try to access prn-summary directly — should get 404
      await browser.url(
        `/organisations/${orgRefNo}/registrations/${registrationId}/reports/2026/monthly/1/submissions/1/prn-summary`
      )
      await checkBodyText('Page not found', 10)

      // Try to access free-perns directly — should get 404
      await browser.url(
        `/organisations/${orgRefNo}/registrations/${registrationId}/reports/2026/monthly/1/submissions/1/free-perns`
      )
      await checkBodyText('Page not found', 10)
    })
  })
})
