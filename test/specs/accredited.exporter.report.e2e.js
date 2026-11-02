import { test, expect } from '@playwright/test'
import { HomePage } from 'page-objects/homepage.js'
import { DashboardPage } from '../page-objects/dashboard.page.js'
import { WasteRecordsPage } from '../page-objects/waste.records.page.js'
import { ReportsPage } from 'page-objects/reports/reports.page.js'
import { ReportDetailPage } from 'page-objects/reports/report.detail.page.js'
import { PrnSummaryPage } from '../page-objects/reports/prn.summary.page.js'
import { FreePernPage } from '../page-objects/reports/free.perns.page.js'
import { ReportSupportingInformationPage } from 'page-objects/reports/report.supporting.information.page.js'
import { ReportCheckAnswersPage } from 'page-objects/reports/report.check.answers.page.js'
import { ConfirmDeleteReportPage } from '../page-objects/confirm.delete.report.page.js'
import {
  createLinkedOrganisation,
  reportsLandingHasNoClosedPeriod,
  seedOverseasSites,
  updateMigratedOrganisation
} from '../support/seeding/organisation.js'
import { unsubmitReport } from '../support/seeding/reports.js'
import {
  registrationStartYear,
  submitSummaryLogContent
} from '../support/seeding/summary-logs.js'
import { generateNumbers } from '../support/reg-acc-number.js'
import { summaryLogContentNumbered } from '../support/spreadsheet/summarylogs-content-generator.js'
import { checkBodyText } from '../support/checks.js'
import { defraIdStub } from '../support/defra-id-stub.js'
import { createLinkAndLogin } from '../support/login-helper.js'
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

// The operator starts and abandons the report twice before completing it, so
// the journey walks the wizard further than any single test budget.
const JOURNEY_TIMEOUT_MS = 4 * 60 * 1000

test.describe('Accredited exporter report flow @accreditedExporter', () => {
  test.skip(
    reportsLandingHasNoClosedPeriod('monthly'),
    'the reports landing has no closed month yet this year'
  )

  test('starts, saves and deletes a report, then completes it through to submission and unsubmission via backend @accreditedExporterFullFlow @accreditedExporterBackLinks @accreditedExporterDelete @accreditedExporterSave', async ({
    page
  }) => {
    test.setTimeout(JOURNEY_TIMEOUT_MS)

    const homePage = new HomePage(page)
    const reportsPage = new ReportsPage(page)
    const reportDetailPage = new ReportDetailPage(page)
    const prnSummaryPage = new PrnSummaryPage(page)
    const freePernPage = new FreePernPage(page)
    const reportSupportingInformationPage = new ReportSupportingInformationPage(
      page
    )
    const reportCheckAnswersPage = new ReportCheckAnswersPage(page)
    const confirmDeleteReportPage = new ConfirmDeleteReportPage(page)
    const confirmationPage = new ConfirmationPage(page)
    const monthlyReportDraftDeclarationPage =
      new MonthlyReportDraftDeclarationPage(page)
    const reportSubmittedPage = new ReportSubmittedPage(page)

    const { regNumber, accNumber } = generateNumbers({
      wasteProcessingType: 'exporter',
      materialSuffix: 'PA'
    })

    const organisationDetails = await createLinkedOrganisation([
      {
        material: 'Paper or board (R3)',
        wasteProcessingType: 'Exporter'
      }
    ])

    const migrationResponse = await updateMigratedOrganisation(
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

    const user = await createLinkAndLogin(
      page,
      organisationDetails.refNo,
      migrationResponse.email
    )

    // Seed the summary log via epr-backend's dev endpoint rather than a
    // real multipart upload: this journey is about the reports wizard,
    // not the upload itself, which the dedicated summary-log specs
    // already cover.
    const summaryLogContent = await summaryLogContentNumbered(
      'resources/sanity/exporter_A26EX5000000002PA_R26EX5000000002PA.xlsx',
      { regNumber, accNumber }
    )
    await submitSummaryLogContent(
      organisationDetails.refNo,
      migrationResponse.registrationIds[0],
      defraIdStub.authHeader(user.userId),
      summaryLogContent,
      registrationStartYear()
    )

    await new DashboardPage(page).selectTableLink(1, 1)
    await new WasteRecordsPage(page).manageReportsLink().click()

    // --- Delete from PRN summary page ---
    await reportsPage.selectActiveActionLink(1)
    await reportDetailPage.useThisData()

    await prnSummaryPage.deleteReportLink().click()
    expect(await confirmDeleteReportPage.headingText()).toBe(
      'Confirm deletion of this report'
    )

    // Back link should return to prn-summary
    await confirmDeleteReportPage.backLink().click()
    expect(await prnSummaryPage.headingText()).toBeTruthy()

    await prnSummaryPage.deleteReportLink().click()
    await confirmDeleteReportPage.confirmDeletion()

    // Back on reports list with status reverted to Due
    await reportsPage.expectListFor(currentYear())
    await expectActionRequiredStatus(page, 1)

    // --- Back links and save-and-come-back-later ---
    await reportsPage.selectActiveActionLink(1)
    await reportDetailPage.useThisData()

    // On prn-summary — back link goes to reports list
    await prnSummaryPage.backLink().click()
    await reportsPage.expectListFor(currentYear())

    // Re-enter the wizard — report is in_progress so the action link
    // routes straight to prn-summary
    await reportsPage.selectActiveActionLink(1)

    await prnSummaryPage.enterRevenue('500')
    await prnSummaryPage.saveAndComeBackLater()
    await reportsPage.expectListFor(currentYear())

    await reportsPage.selectActiveActionLink(1)
    await prnSummaryPage.enterRevenue('500')
    await prnSummaryPage.continue()

    // On free-perns — back link goes to prn-summary
    await freePernPage.backLink().click()
    expect(await prnSummaryPage.headingText()).toBeTruthy()

    await prnSummaryPage.enterRevenue('500')
    await prnSummaryPage.continue()

    await freePernPage.enterTonnage('0')
    await freePernPage.saveAndComeBackLater()
    await reportsPage.expectListFor(currentYear())

    // Continue goes directly to prn-summary for accredited exporters
    await reportsPage.selectActiveActionLink(1)
    await prnSummaryPage.enterRevenue('500')
    await prnSummaryPage.continue()

    // --- Delete from free PERNs page ---
    await freePernPage.deleteReportLink().click()
    expect(await confirmDeleteReportPage.headingText()).toBe(
      'Confirm deletion of this report'
    )
    await confirmDeleteReportPage.confirmDeletion()

    await reportsPage.expectListFor(currentYear())
    await expectActionRequiredStatus(page, 1)

    // --- Complete the report ---
    await reportsPage.selectActiveActionLink(1)
    await reportDetailPage.useThisData()

    expect(await prnSummaryPage.headingText()).toBeTruthy()
    await prnSummaryPage.enterRevenue('1500.50')
    await prnSummaryPage.continue()

    // Enter free PERN tonnage (must be <= issued tonnage)
    expect(await freePernPage.headingText()).toBeTruthy()
    await freePernPage.enterTonnage('0')
    await freePernPage.continue()

    // --- Supporting information page — back link goes to free-perns ---
    expect(await reportSupportingInformationPage.headingText()).toBe(
      'Add supporting information for your regulator (optional)'
    )
    await reportSupportingInformationPage.backLink().click()
    expect(await freePernPage.headingText()).toBeTruthy()

    await freePernPage.enterTonnage('0')
    await freePernPage.continue()
    await reportSupportingInformationPage.continue()

    // --- Check your answers page ---
    expect(await reportCheckAnswersPage.headingText()).toBe(
      'Check your answers before you create this draft report'
    )
    await expectPeriodYear(page, currentYear())

    // Verify PRN revenue persists to CYA
    await checkBodyText(page, '1,500.50', 10)

    await reportCheckAnswersPage.createReport()

    await checkBodyText(page, 'report created', 30)

    // --- View draft report in new tab ---
    await confirmationPage.viewDraftReport().click()
    let newTab = await switchToNewTab(page)

    await checkBodyText(newTab, 'Draft report for', 10)
    await checkBodyText(newTab, 'Ready to submit', 10)
    await checkBodyText(newTab, 'Created by:', 10)
    await checkBodyText(newTab, 'Created on:', 10)
    await checkBodyText(newTab, 'Packaging waste received for exporting', 10)
    await checkBodyText(newTab, 'Packaging waste exported for recycling', 10)
    await checkBodyText(newTab, 'Packaging waste sent on', 10)
    await checkBodyText(newTab, 'Supporting information', 10)

    await closeCurrentTabAndReturn(newTab)

    // Report is now ready_to_submit. Navigating back to check-answers
    // should redirect to the reports list, not show the form again.
    await page.goBack()

    await reportsPage.expectListFor(currentYear())

    // Refresh to see the status change
    await page.reload()

    expect(await reportsPage.getActiveStatusBadge(1)).toBe('Ready to submit')
    expect(await reportsPage.getActiveStatusColour(1)).toBe('blue')

    await reportsPage.selectActiveActionLink(1)

    await monthlyReportDraftDeclarationPage.confirmAndSubmit()

    const confirmationText = await reportSubmittedPage.confirmationText()
    expect(confirmationText).toContain('report submitted to regulator')

    await reportSubmittedPage.viewReportLink().click()
    newTab = await switchToNewTab(page)

    await checkBodyText(newTab, 'Report for', 10)
    await checkBodyText(newTab, 'Submitted', 10)
    await checkBodyText(newTab, 'Submitted by:', 10)
    await checkBodyText(newTab, 'Submitted on:', 10)
    await checkBodyText(newTab, 'Packaging waste received for exporting', 10)
    await checkBodyText(newTab, 'Packaging waste exported for recycling', 10)
    await checkBodyText(newTab, 'Packaging waste sent on', 10)
    await checkBodyText(newTab, 'Supporting information', 10)

    await closeCurrentTabAndReturn(newTab)

    await reportSubmittedPage.returnToReportsLink().click()
    await reportsPage.expectListFor(currentYear())

    expect(await reportsPage.getSubmittedStatusBadge(1)).toBe('Submitted')
    expect(await reportsPage.getSubmittedStatusColour(1)).toBe('green')

    // Now we unsubmit the report via epr-backend to see the effects on the frontend
    await unsubmitReport(
      organisationDetails.refNo,
      migrationResponse.registrationIds[0],
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
