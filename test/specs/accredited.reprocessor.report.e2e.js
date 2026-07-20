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
import ReprocessorPrnSummaryPage from '../page-objects/reports/reprocessor.prn.summary.page.js'
import FreePrnsPage from '../page-objects/reports/free.prns.page.js'
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
import { checkBodyText } from '../support/checks.js'
import ConfirmationPage from '../page-objects/reports/confirmation.page.js'
import {
  switchToNewTab,
  closeCurrentTabAndReturn
} from '../support/windowtabs.js'
import { expectActionRequiredStatus } from '../support/report-status.js'
import MonthlyReportDraftDeclarationPage from 'page-objects/reports/monthly.report.draft.declaration.page.js'
import ReportSubmittedPage from 'page-objects/reports/report.submitted.page.js'

const REG_NUMBER = 'R25SR500010912PA'
const ACC_NUMBER = 'R-ACC12145PA'

async function setupAccreditedReprocessor() {
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
        regNumber: REG_NUMBER,
        accNumber: ACC_NUMBER,
        status: 'approved'
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

async function uploadAndNavigateToReports() {
  await DashboardPage.selectTableLink(1, 1)
  await WasteRecordsPage.submitSummaryLogLink()

  const filePath = `resources/sanity/reprocessorOutput_${ACC_NUMBER}_${REG_NUMBER}.xlsx`
  await UploadSummaryLogPage.performUploadAndReturnToHomepage(filePath)

  await DashboardPage.selectTableLink(1, 1)
  await WasteRecordsPage.manageReportsLink()
}

describe('Accredited reprocessor report flow @accreditedReprocessor', () => {
  describe('accredited reprocessor with upload', () => {
    let setupResponse
    before(async () => {
      setupResponse = await setupAccreditedReprocessor()
      await uploadAndNavigateToReports()
    })

    after(async () => {
      await HomePage.signOut()
      await expect(browser).toHaveTitle(expect.stringContaining('Signed out'))
    })

    it('should display upload new summary log button and cancel link on detail page @accreditedReprocessorDetailButtons', async () => {
      await ReportsPage.selectActiveActionLink(1)
      await ReportDetailPage.verifyDetailPageButtons()
    })

    it('should navigate back correctly through the accredited reprocessor flow @accreditedReprocessorBackLinks', async () => {
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
      await TonnesRecycledPage.enterTonnage('15.02')
      await TonnesRecycledPage.continue()

      // On tonnes-not-recycled — back link goes to tonnes-recycled
      await TonnesNotRecycledPage.selectBackLink()
      const backToTonnesRecycled = await TonnesRecycledPage.headingText()
      expect(backToTonnesRecycled).toBeTruthy()

      // Continue through to prn-summary
      await TonnesRecycledPage.enterTonnage('15.02')
      await TonnesRecycledPage.continue()
      await TonnesNotRecycledPage.enterTonnage('89.31')
      await TonnesNotRecycledPage.continue()

      // On prn-summary — back link goes to tonnes-not-recycled
      await ReprocessorPrnSummaryPage.selectBackLink()
      const backToTonnesNotRecycled = await TonnesNotRecycledPage.headingText()
      expect(backToTonnesNotRecycled).toBeTruthy()

      // Continue through to free-prns
      await TonnesNotRecycledPage.enterTonnage('89.31')
      await TonnesNotRecycledPage.continue()
      await ReprocessorPrnSummaryPage.enterRevenue('1576.12')
      await ReprocessorPrnSummaryPage.continue()

      // On free-prns — back link goes to prn-summary
      await FreePrnsPage.selectBackLink()
      const backToPrnSummary = await ReprocessorPrnSummaryPage.headingText()
      expect(backToPrnSummary).toBeTruthy()

      // Continue through to supporting info
      await ReprocessorPrnSummaryPage.enterRevenue('1576.12')
      await ReprocessorPrnSummaryPage.continue()
      await FreePrnsPage.enterTonnage('0')
      await FreePrnsPage.continue()

      // On supporting info — back link goes to free-prns
      await ReportSupportingInformationPage.selectBackLink()
      const backToFreePrns = await FreePrnsPage.headingText()
      expect(backToFreePrns).toBeTruthy()

      // Clean up — delete report so next test starts fresh
      await FreePrnsPage.deleteReportLink()
      await ConfirmDeleteReportPage.confirmDeletion()
    })

    it('should navigate to delete confirmation from tonnes recycled and PRN summary pages @accreditedReprocessorDelete', async () => {
      await ReportsPage.selectActiveActionLink(1)
      await ReportDetailPage.useThisData()

      // --- Delete from tonnes recycled page ---
      await TonnesRecycledPage.deleteReportLink()

      const deleteHeading = await ConfirmDeleteReportPage.headingText()
      expect(deleteHeading).toBe('Confirm deletion of this report')

      // Back link should return to tonnes-recycled
      await ConfirmDeleteReportPage.selectBackLink()
      const backToTonnesRecycled = await TonnesRecycledPage.headingText()
      expect(backToTonnesRecycled).toBeTruthy()

      // Confirm deletion
      await TonnesRecycledPage.deleteReportLink()
      await ConfirmDeleteReportPage.confirmDeletion()

      // Should be back on reports list with status reverted to Due
      let reportsHeading = await ReportsPage.headingText()
      expect(reportsHeading).toContain('Reports')

      await expectActionRequiredStatus(1)

      // --- Create report again, navigate to prn-summary, delete from there ---
      await ReportsPage.selectActiveActionLink(1)
      await ReportDetailPage.useThisData()
      await TonnesRecycledPage.enterTonnage('15.02')
      await TonnesRecycledPage.continue()
      await TonnesNotRecycledPage.enterTonnage('89.31')
      await TonnesNotRecycledPage.continue()

      await ReprocessorPrnSummaryPage.deleteReportLink()

      const deleteHeading2 = await ConfirmDeleteReportPage.headingText()
      expect(deleteHeading2).toBe('Confirm deletion of this report')

      await ConfirmDeleteReportPage.confirmDeletion()

      // Should be back on reports list with status reverted to Due
      reportsHeading = await ReportsPage.headingText()
      expect(reportsHeading).toContain('Reports')

      await expectActionRequiredStatus(1)
    })

    it('should save and come back later from tonnes recycled page @accreditedReprocessorSave', async () => {
      await ReportsPage.selectActiveActionLink(1)
      await ReportDetailPage.useThisData()

      // --- Save from tonnes recycled page ---
      await TonnesRecycledPage.enterTonnage('15.02')
      await TonnesRecycledPage.saveAndComeBackLater()

      // Should redirect back to reports list
      const reportsHeading = await ReportsPage.headingText()
      expect(reportsHeading).toContain('Reports')

      // Resume the report — should land on tonnes-recycled with pre-populated data
      await ReportsPage.selectActiveActionLink(1)

      // Verify we're back on tonnes-recycled with pre-populated data
      const tonnesRecycledHeading = await TonnesRecycledPage.headingText()
      expect(tonnesRecycledHeading).toBeTruthy()

      const prePopulatedValue = await TonnesRecycledPage.getValue()
      expect(prePopulatedValue).toBe('15.02')

      // Complete the remaining flow
      await TonnesRecycledPage.enterTonnage('15.02')
      await TonnesRecycledPage.continue()

      await TonnesNotRecycledPage.enterTonnage('89.31')
      await TonnesNotRecycledPage.continue()

      await ReprocessorPrnSummaryPage.enterRevenue('1576.12')
      await ReprocessorPrnSummaryPage.continue()

      await FreePrnsPage.enterTonnage('0')
      await FreePrnsPage.continue()

      await ReportSupportingInformationPage.continue()

      // Verify CYA page
      const checkHeading = await ReportCheckAnswersPage.headingText()
      expect(checkHeading).toBe(
        'Check your answers before you create this draft report'
      )

      // Clean up — delete the report
      await ReportCheckAnswersPage.deleteAndStartAgainLink()
      await ConfirmDeleteReportPage.confirmDeletion()
    })

    it('should complete the full accredited reprocessor report flow through to confirmation with submission and unsubmission via backend @accreditedReprocessorFullFlow @smoketest', async () => {
      await ReportsPage.selectActiveActionLink(1)
      await ReportDetailPage.useThisData()

      // --- Tonnes recycled page ---
      const tonnesRecycledHeading = await TonnesRecycledPage.headingText()
      expect(tonnesRecycledHeading).toBeTruthy()

      await TonnesRecycledPage.enterTonnage('15.02')
      await TonnesRecycledPage.continue()

      // --- Tonnes not recycled page ---
      const tonnesNotRecycledHeading = await TonnesNotRecycledPage.headingText()
      expect(tonnesNotRecycledHeading).toBeTruthy()

      await TonnesNotRecycledPage.enterTonnage('89.31')
      await TonnesNotRecycledPage.continue()

      // --- PRN summary page ---
      const prnSummaryHeading = await ReprocessorPrnSummaryPage.headingText()
      expect(prnSummaryHeading).toBeTruthy()

      await ReprocessorPrnSummaryPage.enterRevenue('1576.12')
      await ReprocessorPrnSummaryPage.continue()

      // --- Free PRNs page ---
      const freePrnsHeading = await FreePrnsPage.headingText()
      expect(freePrnsHeading).toBeTruthy()

      await FreePrnsPage.enterTonnage('0')
      await FreePrnsPage.continue()

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

      // Verify data persists to CYA
      await checkBodyText('15.02', 10)
      await checkBodyText('89.31', 10)
      await checkBodyText('1,576.12', 10)

      // Verify average price per tonne is calculated and displayed
      await checkBodyText('Average price per tonne', 10)

      // Submit the report
      await ReportCheckAnswersPage.createReportAndCheckDoubleClickPrevented()

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
      await checkBodyText('Site', 10)
      await checkBodyText('Packaging waste received for reprocessing', 10)
      await checkBodyText('Packaging waste recycling', 10)
      await checkBodyText('Packaging waste sent on', 10)
      await checkBodyText('Supporting information', 10)

      // Verify the tonnage values from the report
      await checkBodyText('15.02', 5)
      await checkBodyText('89.31', 5)

      // Close draft tab and return to confirmation page
      await closeCurrentTabAndReturn(originalTab)

      await ConfirmationPage.goToReports()

      const reportsHeading = await ReportsPage.headingText()
      expect(reportsHeading).toContain('Reports')

      await ReportsPage.selectActiveActionLink(1)

      // Confirm and submit report
      await MonthlyReportDraftDeclarationPage.submitAndCheckDoubleClickPrevented()

      const confirmationText = await ReportSubmittedPage.confirmationText()
      expect(confirmationText).toContain('report submitted to regulator')

      await ReportSubmittedPage.viewReportLink()
      originalTab = await switchToNewTab()

      await checkBodyText('Report for', 10)
      await checkBodyText('Submitted', 10)
      await checkBodyText('Submitted by:', 10)
      await checkBodyText('Submitted on:', 10)
      await checkBodyText('Site', 10)
      await checkBodyText('Packaging waste received for reprocessing', 10)
      await checkBodyText('Packaging waste recycling', 10)
      await checkBodyText('Packaging waste sent on', 10)
      await checkBodyText('Supporting information', 10)

      // Verify the tonnage values from the report
      await checkBodyText('15.02', 5)
      await checkBodyText('89.31', 5)

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

  describe('non-accredited reprocessor route guard', () => {
    it('should return 404 when registered-only reprocessor tries to access PRN pages @registeredOnlyReprocessorRouteGuard', async () => {
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
            regNumber: 'R25SR500030913PA',
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

      // Try to access prn-summary directly — should get 404
      await browser.url(
        `/organisations/${organisationDetails.refNo}/registrations/${migrationResponse.registrationIds[0]}/reports/2026/monthly/1/submissions/1/prn-summary`
      )
      await checkBodyText('404', 10)
      await checkBodyText('Page not found', 10)

      // Try to access free-prns directly — should get 404
      await browser.url(
        `/organisations/${organisationDetails.refNo}/registrations/${migrationResponse.registrationIds[0]}/reports/2026/monthly/1/submissions/1/free-prns`
      )
      await checkBodyText('404', 10)
      await checkBodyText('Page not found', 10)

      await HomePage.signOut()
      await expect(browser).toHaveTitle(expect.stringContaining('Signed out'))
    })
  })
})
