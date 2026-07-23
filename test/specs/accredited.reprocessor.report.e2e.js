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
  unsubmitReport,
  updateMigratedOrganisation
} from '../support/apicalls.js'
import { checkBodyText } from '../support/checks.js'
import { createLinkAndLogin } from '../support/login-helper.js'
import { uploadSummaryLogAndNavigateToReports } from '../support/report-navigation.js'
import { ConfirmationPage } from '../page-objects/reports/confirmation.page.js'
import {
  switchToNewTab,
  closeCurrentTabAndReturn
} from '../support/windowtabs.js'
import { expectActionRequiredStatus } from '../support/report-status.js'
import { MonthlyReportDraftDeclarationPage } from 'page-objects/reports/monthly.report.draft.declaration.page.js'
import { ReportSubmittedPage } from 'page-objects/reports/report.submitted.page.js'

const REG_NUMBER = 'R25SR500010912PA'
const ACC_NUMBER = 'R-ACC12145PA'

async function setupAccreditedReprocessor(page) {
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

  await createLinkAndLogin(
    page,
    organisationDetails.refNo,
    migrationResponse.email
  )

  return { organisationDetails, migrationResponse }
}

async function uploadAndNavigateToReports(page) {
  await uploadSummaryLogAndNavigateToReports(
    page,
    `resources/sanity/reprocessorOutput_${ACC_NUMBER}_${REG_NUMBER}.xlsx`
  )
}

test.describe('Accredited reprocessor report flow @accreditedReprocessor', () => {
  // The 5 tests below share one continuous login session/report, the same
  // way the original WDIO spec's single global `browser` session did - serial
  // mode + a manually-created page (rather than the per-test `page` fixture)
  // is Playwright's equivalent of that shared-session pattern.
  test.describe.serial('accredited reprocessor with upload', () => {
    /** @type {import('@playwright/test').Page} */
    let page
    let setupResponse

    test.beforeAll(async ({ browser }) => {
      page = await browser.newPage()
      setupResponse = await setupAccreditedReprocessor(page)
      await uploadAndNavigateToReports(page)
    })

    test.afterAll(async () => {
      const homePage = new HomePage(page)
      await homePage.signOut()
      await expect(page).toHaveTitle(/Signed out/)
      await page.close()
    })

    test('should display upload new summary log button and cancel link on detail page @accreditedReprocessorDetailButtons', async () => {
      const reportsPage = new ReportsPage(page)
      const reportDetailPage = new ReportDetailPage(page)

      await reportsPage.selectActiveActionLink(1)
      await reportDetailPage.verifyDetailPageButtons()
    })

    test('should navigate back correctly through the accredited reprocessor flow @accreditedReprocessorBackLinks', async () => {
      const reportsPage = new ReportsPage(page)
      const reportDetailPage = new ReportDetailPage(page)
      const tonnesRecycledPage = new TonnesRecycledPage(page)
      const tonnesNotRecycledPage = new TonnesNotRecycledPage(page)
      const reprocessorPrnSummaryPage = new ReprocessorPrnSummaryPage(page)
      const freePrnsPage = new FreePrnsPage(page)
      const reportSupportingInformationPage =
        new ReportSupportingInformationPage(page)
      const confirmDeleteReportPage = new ConfirmDeleteReportPage(page)

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
      await tonnesRecycledPage.enterTonnage('15.02')
      await tonnesRecycledPage.continue()

      // On tonnes-not-recycled — back link goes to tonnes-recycled
      await tonnesNotRecycledPage.selectBackLink()
      const backToTonnesRecycled = await tonnesRecycledPage.headingText()
      expect(backToTonnesRecycled).toBeTruthy()

      // Continue through to prn-summary
      await tonnesRecycledPage.enterTonnage('15.02')
      await tonnesRecycledPage.continue()
      await tonnesNotRecycledPage.enterTonnage('89.31')
      await tonnesNotRecycledPage.continue()

      // On prn-summary — back link goes to tonnes-not-recycled
      await reprocessorPrnSummaryPage.selectBackLink()
      const backToTonnesNotRecycled = await tonnesNotRecycledPage.headingText()
      expect(backToTonnesNotRecycled).toBeTruthy()

      // Continue through to free-prns
      await tonnesNotRecycledPage.enterTonnage('89.31')
      await tonnesNotRecycledPage.continue()
      await reprocessorPrnSummaryPage.enterRevenue('1576.12')
      await reprocessorPrnSummaryPage.continue()

      // On free-prns — back link goes to prn-summary
      await freePrnsPage.selectBackLink()
      const backToPrnSummary = await reprocessorPrnSummaryPage.headingText()
      expect(backToPrnSummary).toBeTruthy()

      // Continue through to supporting info
      await reprocessorPrnSummaryPage.enterRevenue('1576.12')
      await reprocessorPrnSummaryPage.continue()
      await freePrnsPage.enterTonnage('0')
      await freePrnsPage.continue()

      // On supporting info — back link goes to free-prns
      await reportSupportingInformationPage.selectBackLink()
      const backToFreePrns = await freePrnsPage.headingText()
      expect(backToFreePrns).toBeTruthy()

      // Clean up — delete report so next test starts fresh
      await freePrnsPage.deleteReportLink()
      await confirmDeleteReportPage.confirmDeletion()
    })

    test('should navigate to delete confirmation from tonnes recycled and PRN summary pages @accreditedReprocessorDelete', async () => {
      const reportsPage = new ReportsPage(page)
      const reportDetailPage = new ReportDetailPage(page)
      const tonnesRecycledPage = new TonnesRecycledPage(page)
      const tonnesNotRecycledPage = new TonnesNotRecycledPage(page)
      const reprocessorPrnSummaryPage = new ReprocessorPrnSummaryPage(page)
      const confirmDeleteReportPage = new ConfirmDeleteReportPage(page)

      await reportsPage.selectActiveActionLink(1)
      await reportDetailPage.useThisData()

      // --- Delete from tonnes recycled page ---
      await tonnesRecycledPage.deleteReportLink()

      const deleteHeading = await confirmDeleteReportPage.headingText()
      expect(deleteHeading).toBe('Confirm deletion of this report')

      // Back link should return to tonnes-recycled
      await confirmDeleteReportPage.selectBackLink()
      const backToTonnesRecycled = await tonnesRecycledPage.headingText()
      expect(backToTonnesRecycled).toBeTruthy()

      // Confirm deletion
      await tonnesRecycledPage.deleteReportLink()
      await confirmDeleteReportPage.confirmDeletion()

      // Should be back on reports list with status reverted to Due
      let reportsHeading = await reportsPage.headingText()
      expect(reportsHeading).toContain('Reports')

      await expectActionRequiredStatus(page, 1)

      // --- Create report again, navigate to prn-summary, delete from there ---
      await reportsPage.selectActiveActionLink(1)
      await reportDetailPage.useThisData()
      await tonnesRecycledPage.enterTonnage('15.02')
      await tonnesRecycledPage.continue()
      await tonnesNotRecycledPage.enterTonnage('89.31')
      await tonnesNotRecycledPage.continue()

      await reprocessorPrnSummaryPage.deleteReportLink()

      const deleteHeading2 = await confirmDeleteReportPage.headingText()
      expect(deleteHeading2).toBe('Confirm deletion of this report')

      await confirmDeleteReportPage.confirmDeletion()

      // Should be back on reports list with status reverted to Due
      reportsHeading = await reportsPage.headingText()
      expect(reportsHeading).toContain('Reports')

      await expectActionRequiredStatus(page, 1)
    })

    test('should save and come back later from tonnes recycled page @accreditedReprocessorSave', async () => {
      const reportsPage = new ReportsPage(page)
      const reportDetailPage = new ReportDetailPage(page)
      const tonnesRecycledPage = new TonnesRecycledPage(page)
      const tonnesNotRecycledPage = new TonnesNotRecycledPage(page)
      const reprocessorPrnSummaryPage = new ReprocessorPrnSummaryPage(page)
      const freePrnsPage = new FreePrnsPage(page)
      const reportSupportingInformationPage =
        new ReportSupportingInformationPage(page)
      const reportCheckAnswersPage = new ReportCheckAnswersPage(page)
      const confirmDeleteReportPage = new ConfirmDeleteReportPage(page)

      await reportsPage.selectActiveActionLink(1)
      await reportDetailPage.useThisData()

      // --- Save from tonnes recycled page ---
      await tonnesRecycledPage.enterTonnage('15.02')
      await tonnesRecycledPage.saveAndComeBackLater()

      // Should redirect back to reports list
      const reportsHeading = await reportsPage.headingText()
      expect(reportsHeading).toContain('Reports')

      // Resume the report — should land on tonnes-recycled with pre-populated data
      await reportsPage.selectActiveActionLink(1)

      // Verify we're back on tonnes-recycled with pre-populated data
      const tonnesRecycledHeading = await tonnesRecycledPage.headingText()
      expect(tonnesRecycledHeading).toBeTruthy()

      const prePopulatedValue = await tonnesRecycledPage.getValue()
      expect(prePopulatedValue).toBe('15.02')

      // Complete the remaining flow
      await tonnesRecycledPage.enterTonnage('15.02')
      await tonnesRecycledPage.continue()

      await tonnesNotRecycledPage.enterTonnage('89.31')
      await tonnesNotRecycledPage.continue()

      await reprocessorPrnSummaryPage.enterRevenue('1576.12')
      await reprocessorPrnSummaryPage.continue()

      await freePrnsPage.enterTonnage('0')
      await freePrnsPage.continue()

      await reportSupportingInformationPage.continue()

      // Verify CYA page
      const checkHeading = await reportCheckAnswersPage.headingText()
      expect(checkHeading).toBe(
        'Check your answers before you create this draft report'
      )

      // Clean up — delete the report
      await reportCheckAnswersPage.deleteAndStartAgainLink()
      await confirmDeleteReportPage.confirmDeletion()
    })

    test('should complete the full accredited reprocessor report flow through to confirmation with submission and unsubmission via backend @accreditedReprocessorFullFlow @smoketest', async () => {
      const reportsPage = new ReportsPage(page)
      const reportDetailPage = new ReportDetailPage(page)
      const tonnesRecycledPage = new TonnesRecycledPage(page)
      const tonnesNotRecycledPage = new TonnesNotRecycledPage(page)
      const reprocessorPrnSummaryPage = new ReprocessorPrnSummaryPage(page)
      const freePrnsPage = new FreePrnsPage(page)
      const reportSupportingInformationPage =
        new ReportSupportingInformationPage(page)
      const reportCheckAnswersPage = new ReportCheckAnswersPage(page)
      const confirmationPage = new ConfirmationPage(page)
      const monthlyReportDraftDeclarationPage =
        new MonthlyReportDraftDeclarationPage(page)
      const reportSubmittedPage = new ReportSubmittedPage(page)

      await reportsPage.selectActiveActionLink(1)
      await reportDetailPage.useThisData()

      // --- Tonnes recycled page ---
      const tonnesRecycledHeading = await tonnesRecycledPage.headingText()
      expect(tonnesRecycledHeading).toBeTruthy()

      await tonnesRecycledPage.enterTonnage('15.02')
      await tonnesRecycledPage.continue()

      // --- Tonnes not recycled page ---
      const tonnesNotRecycledHeading = await tonnesNotRecycledPage.headingText()
      expect(tonnesNotRecycledHeading).toBeTruthy()

      await tonnesNotRecycledPage.enterTonnage('89.31')
      await tonnesNotRecycledPage.continue()

      // --- PRN summary page ---
      const prnSummaryHeading = await reprocessorPrnSummaryPage.headingText()
      expect(prnSummaryHeading).toBeTruthy()

      await reprocessorPrnSummaryPage.enterRevenue('1576.12')
      await reprocessorPrnSummaryPage.continue()

      // --- Free PRNs page ---
      const freePrnsHeading = await freePrnsPage.headingText()
      expect(freePrnsHeading).toBeTruthy()

      await freePrnsPage.enterTonnage('0')
      await freePrnsPage.continue()

      // --- Supporting information page ---
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

      // Verify data persists to CYA
      await checkBodyText(page, '15.02', 10)
      await checkBodyText(page, '89.31', 10)
      await checkBodyText(page, '1,576.12', 10)

      // Verify average price per tonne is calculated and displayed
      await checkBodyText(page, 'Average price per tonne', 10)

      // Submit the report
      await reportCheckAnswersPage.createReportAndCheckDoubleClickPrevented()

      // Verify confirmation page
      await checkBodyText(page, 'report created', 30)

      // --- View draft report in new tab ---
      await confirmationPage.viewDraftReport()
      let newTab = await switchToNewTab(page)

      // Verify draft report page content
      await checkBodyText(newTab, 'Draft report for', 10)
      await checkBodyText(newTab, 'Ready to submit', 10)
      await checkBodyText(newTab, 'Created by:', 10)
      await checkBodyText(newTab, 'Created on:', 10)
      await checkBodyText(newTab, 'Site', 10)
      await checkBodyText(
        newTab,
        'Packaging waste received for reprocessing',
        10
      )
      await checkBodyText(newTab, 'Packaging waste recycling', 10)
      await checkBodyText(newTab, 'Packaging waste sent on', 10)
      await checkBodyText(newTab, 'Supporting information', 10)

      // Verify the tonnage values from the report
      await checkBodyText(newTab, '15.02', 5)
      await checkBodyText(newTab, '89.31', 5)

      // Close draft tab and return to confirmation page
      await closeCurrentTabAndReturn(newTab)

      await confirmationPage.goToReports()

      const reportsHeading = await reportsPage.headingText()
      expect(reportsHeading).toContain('Reports')

      await reportsPage.selectActiveActionLink(1)

      // Confirm and submit report
      await monthlyReportDraftDeclarationPage.submitAndCheckDoubleClickPrevented()

      const confirmationText = await reportSubmittedPage.confirmationText()
      expect(confirmationText).toContain('report submitted to regulator')

      await reportSubmittedPage.viewReportLink()
      newTab = await switchToNewTab(page)

      await checkBodyText(newTab, 'Report for', 10)
      await checkBodyText(newTab, 'Submitted', 10)
      await checkBodyText(newTab, 'Submitted by:', 10)
      await checkBodyText(newTab, 'Submitted on:', 10)
      await checkBodyText(newTab, 'Site', 10)
      await checkBodyText(
        newTab,
        'Packaging waste received for reprocessing',
        10
      )
      await checkBodyText(newTab, 'Packaging waste recycling', 10)
      await checkBodyText(newTab, 'Packaging waste sent on', 10)
      await checkBodyText(newTab, 'Supporting information', 10)

      // Verify the tonnage values from the report
      await checkBodyText(newTab, '15.02', 5)
      await checkBodyText(newTab, '89.31', 5)

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
        'monthly',
        1,
        1
      )

      // Refresh to see the status change
      await page.reload()

      const unsubmittedBadge = await reportsPage.getActiveStatusBadge(1)
      const unsubmittedColour = await reportsPage.getActiveStatusColour(1)

      expect(unsubmittedBadge).toBe('Ready to submit')
      expect(unsubmittedColour).toBe('blue')
    })
  })

  test.describe('non-accredited reprocessor route guard', () => {
    test('should return 404 when registered-only reprocessor tries to access PRN pages @registeredOnlyReprocessorRouteGuard', async ({
      page
    }) => {
      const homePage = new HomePage(page)

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

      await createLinkAndLogin(
        page,
        organisationDetails.refNo,
        migrationResponse.email
      )

      // Try to access prn-summary directly — should get 404
      await page.goto(
        `/organisations/${organisationDetails.refNo}/registrations/${migrationResponse.registrationIds[0]}/reports/2026/monthly/1/submissions/1/prn-summary`
      )
      await checkBodyText(page, '404', 10)
      await checkBodyText(page, 'Page not found', 10)

      // Try to access free-prns directly — should get 404
      await page.goto(
        `/organisations/${organisationDetails.refNo}/registrations/${migrationResponse.registrationIds[0]}/reports/2026/monthly/1/submissions/1/free-prns`
      )
      await checkBodyText(page, '404', 10)
      await checkBodyText(page, 'Page not found', 10)

      await homePage.signOut()
      await expect(page).toHaveTitle(/Signed out/)
    })
  })
})
