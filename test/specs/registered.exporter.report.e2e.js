import { test, expect } from '@playwright/test'
import { HomePage } from 'page-objects/homepage.js'
import { DashboardPage } from 'page-objects/dashboard.page.js'
import { ConfirmationPage } from 'page-objects/reports/confirmation.page.js'
import { MonthlyReportDraftDeclarationPage } from 'page-objects/reports/monthly.report.draft.declaration.page.js'
import { ReportCheckAnswersPage } from 'page-objects/reports/report.check.answers.page.js'
import { ReportDetailPage } from 'page-objects/reports/report.detail.page.js'
import { ReportSubmittedPage } from 'page-objects/reports/report.submitted.page.js'
import { ReportSupportingInformationPage } from 'page-objects/reports/report.supporting.information.page.js'
import { ReportsPage } from 'page-objects/reports/reports.page.js'
import { ConfirmDeleteReportPage } from '../page-objects/confirm.delete.report.page.js'
import { TonnesNotExportedPage } from '../page-objects/reports/tonnes.not.exported.page.js'
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
import {
  navigateToReports,
  uploadSummaryLogAndNavigateToReports
} from '../support/report-navigation.js'

const REG_NUMBER = 'E25SR500030913PA'

async function uploadAndNavigateToReports(page) {
  await uploadSummaryLogAndNavigateToReports(
    page,
    'resources/exporter-regonly.xlsx'
  )
}

async function setupRegisteredOnlyExporter(page) {
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

  await createLinkAndLogin(
    page,
    organisationDetails.refNo,
    migrationResponse.email
  )

  return { organisationDetails, migrationResponse }
}

test.describe('Registered-only exporter report flow @registeredOnlyExporter', () => {
  // These 3 tests share one continuous login session/report, the same
  // pattern used in accredited.reprocessor.report.e2e.js - serial mode + a
  // manually-created page shares setup instead of re-paying org creation,
  // login, and summary log upload 3 times. BackLinks cleans its report back
  // to "Due" so FullFlow (last, since it ends in a submitted/unsubmitted
  // state) starts fresh.
  //
  // CheckAnswersGuard and SubmitGuard (below, outside this group) each leave
  // a Ready-to-submit/Submitted report with no proven-safe way back to "Due"
  // for this registered-only (no-accreditation) org shape, so they keep
  // their own independent setup rather than risk a flaky shared sequence.
  test.describe.serial('registered-only exporter with upload', () => {
    /** @type {import('@playwright/test').Page} */
    let page
    let setupResponse

    test.beforeAll(async ({ browser }) => {
      page = await browser.newPage()
      setupResponse = await setupRegisteredOnlyExporter(page)
      await seedOverseasSites(
        setupResponse.organisationDetails.refNo,
        [0],
        [143, 297, 565, 893]
      )
      await uploadAndNavigateToReports(page)
    })

    test.afterAll(async () => {
      const homePage = new HomePage(page)
      await homePage.signOut()
      await expect(page).toHaveTitle(/Signed out/)
      await page.close()
    })

    test('should return 404 when navigating directly to PERN pages @registeredOnlyExporterRouteGuard', async () => {
      const { organisationDetails, migrationResponse } = setupResponse

      // Try to access prn-summary directly — should get 404
      await page.goto(
        `/organisations/${organisationDetails.refNo}/registrations/${migrationResponse.registrationIds[0]}/reports/2026/quarterly/1/submissions/1/prn-summary`
      )
      await checkBodyText(page, '404', 10)
      await checkBodyText(page, 'Page not found', 10)

      // Try to access free-perns directly — should get 404
      await page.goto(
        `/organisations/${organisationDetails.refNo}/registrations/${migrationResponse.registrationIds[0]}/reports/2026/quarterly/1/submissions/1/free-perns`
      )
      await checkBodyText(page, '404', 10)
      await checkBodyText(page, 'Page not found', 10)

      // The 404 checks above navigate away via raw page.goto to pages with no
      // rendered dashboard, so re-open the dashboard from scratch (rather
      // than assuming a table is already on the page) before returning to
      // the reports list, so the next test in this shared session starts
      // from the state it expects.
      const dashboardPage = new DashboardPage(page)
      await dashboardPage.open(organisationDetails.refNo)
      await navigateToReports(page)
    })

    test('should navigate back correctly through the registered-only exporter flow @registeredOnlyExporterBackLinks', async () => {
      const reportDetailPage = new ReportDetailPage(page)
      const reportSupportingInformationPage =
        new ReportSupportingInformationPage(page)
      const reportsPage = new ReportsPage(page)
      const tonnesNotExportedPage = new TonnesNotExportedPage(page)
      const confirmDeleteReportPage = new ConfirmDeleteReportPage(page)

      await reportsPage.selectActiveActionLink(1)
      await reportDetailPage.useThisData()

      // On tonnes-not-exported — back link goes to reports list
      await tonnesNotExportedPage.selectBackLink()
      const reportsHeading = await reportsPage.headingText()
      expect(reportsHeading).toContain('Reports')

      // Re-enter the wizard — report is in_progress so the action link
      // routes straight to tonnes-not-exported
      await reportsPage.selectActiveActionLink(1)

      // Continue to tonnage not exported page
      await tonnesNotExportedPage.enterTonnage('5.50')

      await tonnesNotExportedPage.continue()

      // On supporting-information — back link goes to tonnes-not-exported (not free-perns)
      await reportSupportingInformationPage.selectBackLink()
      const backToTonnesNotExported = await tonnesNotExportedPage.headingText()
      expect(backToTonnesNotExported).toBeTruthy()

      // Clean up — leave the period "Due" for the next test
      await tonnesNotExportedPage.deleteReportLink()
      await confirmDeleteReportPage.confirmDeletion()
    })

    test('should complete the full registered-only exporter report flow through to confirmation @registeredOnlyExporterFullFlow @smoketest', async () => {
      const confirmationPage = new ConfirmationPage(page)
      const monthlyReportDraftDeclarationPage =
        new MonthlyReportDraftDeclarationPage(page)
      const reportCheckAnswersPage = new ReportCheckAnswersPage(page)
      const reportDetailPage = new ReportDetailPage(page)
      const reportSubmittedPage = new ReportSubmittedPage(page)
      const reportSupportingInformationPage =
        new ReportSupportingInformationPage(page)
      const reportsPage = new ReportsPage(page)
      const tonnesNotExportedPage = new TonnesNotExportedPage(page)

      // Start the report — verify detail page buttons before proceeding
      await reportsPage.selectActiveActionLink(1)
      await reportDetailPage.verifyDetailPageButtons()

      await reportsPage.selectActiveActionLink(1)
      await reportDetailPage.useThisData()

      // --- Tonnes not exported page ---
      const tonnesNotExportedHeading = await tonnesNotExportedPage.headingText()
      expect(tonnesNotExportedHeading).toBeTruthy()

      await tonnesNotExportedPage.enterTonnage('5.50')
      await tonnesNotExportedPage.continue()

      // --- Supporting information page (no PERN pages for registered-only) ---
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

      // Verify tonnage not exported value and change link present on CYA
      await checkBodyText(page, '5.50', 10)
      const changeLink = page.locator('a[href*="tonnes-not-exported"]')
      expect(await changeLink.count()).toBeGreaterThan(0)

      // Verify NO PERN section present
      await checkBodyTextDoesNotInclude(page, 'PERN revenue', 5)
      await checkBodyTextDoesNotInclude(page, 'Free PERNs', 5)

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
      await checkBodyText(newTab, 'Packaging waste received for exporting', 10)
      await checkBodyText(newTab, 'Packaging waste exported for recycling', 10)
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
      await checkBodyText(newTab, 'Packaging waste received for exporting', 10)
      await checkBodyText(newTab, 'Packaging waste exported for recycling', 10)
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
    })
  })

  test('should redirect to reports list when navigating back to check-answers after report is created @registeredOnlyExporterCheckAnswersGuard', async ({
    page
  }) => {
    const homePage = new HomePage(page)
    const reportDetailPage = new ReportDetailPage(page)
    const reportSupportingInformationPage = new ReportSupportingInformationPage(
      page
    )
    const reportCheckAnswersPage = new ReportCheckAnswersPage(page)
    const reportsPage = new ReportsPage(page)
    const tonnesNotExportedPage = new TonnesNotExportedPage(page)

    await setupRegisteredOnlyExporter(page)
    await uploadAndNavigateToReports(page)

    // Complete the full flow through to confirmation
    await reportsPage.selectActiveActionLink(1)
    await reportDetailPage.useThisData()
    await tonnesNotExportedPage.enterTonnage('5.50')
    await tonnesNotExportedPage.continue()
    await reportSupportingInformationPage.continue()
    await reportCheckAnswersPage.createReport()
    await checkBodyText(page, 'report created', 30)

    // Navigate back to check-answers — the guard should redirect to the reports list
    await page.goBack()

    const reportsHeading = await reportsPage.headingText()
    expect(reportsHeading).toContain('Reports')

    await homePage.signOut()
    await expect(page).toHaveTitle(/Signed out/)
  })

  test('should redirect to submitted confirmation page when navigating back to submit after submission @registeredOnlyExporterSubmitGuard', async ({
    page
  }) => {
    const homePage = new HomePage(page)
    const confirmationPage = new ConfirmationPage(page)
    const monthlyReportDraftDeclarationPage =
      new MonthlyReportDraftDeclarationPage(page)
    const reportCheckAnswersPage = new ReportCheckAnswersPage(page)
    const reportDetailPage = new ReportDetailPage(page)
    const reportSubmittedPage = new ReportSubmittedPage(page)
    const reportSupportingInformationPage = new ReportSupportingInformationPage(
      page
    )
    const reportsPage = new ReportsPage(page)
    const tonnesNotExportedPage = new TonnesNotExportedPage(page)

    await setupRegisteredOnlyExporter(page)
    await uploadAndNavigateToReports(page)

    // Complete the full flow through to submission
    await reportsPage.selectActiveActionLink(1)
    await reportDetailPage.useThisData()
    await tonnesNotExportedPage.enterTonnage('5.50')
    await tonnesNotExportedPage.continue()
    await reportSupportingInformationPage.continue()
    await reportCheckAnswersPage.createReport()
    await checkBodyText(page, 'report created', 30)
    await confirmationPage.goToReports()
    await reportsPage.selectActiveActionLink(1)
    await monthlyReportDraftDeclarationPage.confirmAndSubmit()
    await checkBodyText(page, 'report submitted to regulator', 30)

    // Navigate back to the submit page — the guard should redirect back to submitted
    await page.goBack()

    const confirmationText = await reportSubmittedPage.confirmationText()
    expect(confirmationText).toContain('report submitted to regulator')

    await homePage.signOut()
    await expect(page).toHaveTitle(/Signed out/)
  })
})
