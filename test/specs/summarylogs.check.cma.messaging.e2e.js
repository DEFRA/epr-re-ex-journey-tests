import { test, expect } from '@playwright/test'
import { HomePage } from 'page-objects/homepage.js'
import { UploadSummaryLogPage } from '../page-objects/upload.summary.log.page.js'
import { CheckSummaryLogPage } from '../page-objects/check.summary.log.page.js'
import { WasteRecordsPage } from '../page-objects/waste.records.page.js'
import { DashboardPage } from '../page-objects/dashboard.page.js'
import { ReportsPage } from '../page-objects/reports/reports.page.js'
import { ReportViewPage } from '../page-objects/reports/report.view.page.js'
import { ResubmissionExplainerPage } from '../page-objects/reports/resubmission.explainer.page.js'
import { ReportDetailPage } from '../page-objects/reports/report.detail.page.js'
import { TonnesRecycledPage } from '../page-objects/reports/tonnes.recycled.page.js'
import { TonnesNotRecycledPage } from '../page-objects/reports/tonnes.not.recycled.page.js'
import { ReportSupportingInformationPage } from '../page-objects/reports/report.supporting.information.page.js'
import { ReportCheckAnswersPage } from '../page-objects/reports/report.check.answers.page.js'
import { ConfirmationPage } from '../page-objects/reports/confirmation.page.js'
import { MonthlyReportDraftDeclarationPage } from '../page-objects/reports/monthly.report.draft.declaration.page.js'
import { ReportSubmittedPage } from '../page-objects/reports/report.submitted.page.js'
import {
  checkBodyText,
  checkBodyTextDoesNotInclude
} from '../support/checks.js'
import { checkOnCheckPage } from '../support/summary-log-checks.js'
import {
  createLinkedOrganisation,
  updateMigratedOrganisation
} from '../support/seeding/organisation.js'
import { seedSubmittedReport } from '../support/seeding/reports.js'
import { summaryLogNumbered } from '../support/seeding/summary-logs.js'
import { generateRegNumber } from '../support/reg-acc-number.js'
import {
  registerAndLinkDefraIdUser,
  loginViaHomePage
} from '../support/login-helper.js'

// The year reprocessor-output-regonly-cma.xlsx dates its loads in. A quarter is
// closed by its submitted report, not by the calendar, so the journey stays in
// this year.
const FIXTURE_YEAR = 2026

// PAE-1648 closed-period adjustment messaging copy (en.json
// summary-log:closedPeriodAdjustments), asserted verbatim by the closed-period
// messaging tests below.
const IMPORTANT_BODY =
  "If you upload this summary log, you'll need to create a new report for any relevant period and an approved person from your business will need to resubmit it to your regulator."
const FURTHER_ACTION_HEADING = 'Further action needed'
const FURTHER_ACTION_PARA_1 =
  "Data from a period that you had already reported on has been changed, so you'll need to create a new report."
const FURTHER_ACTION_PARA_2 =
  'Once the new report has been created, an approved person from your business will need to submit it to your regulator.'
const FURTHER_ACTION_PARA_3 =
  "Reports that need to be resubmitted to your regulator show the status 'Requires resubmission' on the reports page."

// The "Important" banner and "Further action needed" messaging that render
// when closed-period adjustments are detected, then the registered-only
// quarterly resubmission they ask for, through to Resubmitted. See
// summarylogs.check.cma.sections.e2e.js for open/closed section visibility
// and reports.requires.resubmission.e2e.js for adjusted-load sub-state
// rendering. The "no closed-period adjustments" control case lives in
// summarylogs.exporter.e2e.js instead (see comment below).
test.describe('Summary Logs - Check Page with CMA Detection - Closed-period Adjustment Messaging', () => {
  test('shows the Important banner and Further action needed messaging when closed-period adjustments are detected, then creates, reviews and submits the resubmission, ending as Resubmitted on the reports landing @closedPeriodMessaging @requiresResubmissionStatus @reviewAndSubmit @cma', async ({
    page
  }) => {
    const homePage = new HomePage(page)
    const uploadSummaryLogPage = new UploadSummaryLogPage(page)
    const checkSummaryLogPage = new CheckSummaryLogPage(page)
    const wasteRecordsPage = new WasteRecordsPage(page)
    const dashboardPage = new DashboardPage(page)

    const organisationDetails = await createLinkedOrganisation([
      {
        material: 'Paper or board (R3)',
        wasteProcessingType: 'Reprocessor',
        withoutAccreditation: true
      }
    ])
    const regNumber = generateRegNumber({
      wasteProcessingType: 'reprocessor',
      materialSuffix: 'PA'
    })

    const migrationResponse = await updateMigratedOrganisation(
      organisationDetails.refNo,
      [
        {
          reprocessingType: 'output',
          regNumber,
          status: 'approved',
          withoutAccreditation: true
        }
      ],
      undefined,
      `${FIXTURE_YEAR}-01-01`
    )

    const user = await registerAndLinkDefraIdUser(
      organisationDetails.refNo,
      migrationResponse.email
    )

    const regId = migrationResponse.registrationIds[0]

    await seedSubmittedReport(
      organisationDetails.refNo,
      regId,
      user.userId,
      FIXTURE_YEAR,
      'quarterly',
      1,
      1,
      { tonnageRecycled: 100, tonnageNotRecycled: 0 }
    )

    await loginViaHomePage(page, migrationResponse.email)

    await dashboardPage.chooseYear(FIXTURE_YEAR)
    await dashboardPage.selectLink(1)

    await wasteRecordsPage.submitSummaryLogLink().click()

    await uploadSummaryLogPage.uploadFile(
      await summaryLogNumbered(
        'resources/reprocessor-output-regonly-cma.xlsx',
        { regNumber }
      )
    )
    await uploadSummaryLogPage.continue()

    await checkBodyText(page, 'Your summary log is being checked', 30)
    await checkOnCheckPage(page)

    // The "Important" banner is shown on the check before you submit page.
    const banner = checkSummaryLogPage.importantBanner()
    expect((await banner.count()) > 0).toBe(true)
    const bannerText = await banner.innerText()
    expect(bannerText).toContain('Important')
    expect(bannerText).toContain(IMPORTANT_BODY)

    // Merged from summarylogs.check.cma.sections.e2e.js's cmaDetected case
    // (same org/upload setup, duplicated purely to assert the closed-period
    // section heading and sub-state content on this same check page).
    await checkBodyText(page, 'Closed periods: new loads', 30)
    const subStates = (await checkSummaryLogPage.allSubStateHeadings()).join(
      ' | '
    )
    expect(subStates).toContain('8 new loads will be recorded')
    await checkBodyText(page, 'These have been added to your summary log.', 30)

    // Submit inline (not performUploadAndReturnToHomepage, which would click
    // "Return to home" and skip the success-page assertions below).
    await checkSummaryLogPage.uploadButton().click()

    await checkBodyText(page, 'Your waste records are being updated', 30)
    await uploadSummaryLogPage.checkUploaded()

    // The "Further action needed" section and "Go to reports" button are shown
    // on the success page, and the button links to the reports page.
    await checkBodyText(page, FURTHER_ACTION_HEADING, 10)
    await checkBodyText(page, FURTHER_ACTION_PARA_1, 5)
    await checkBodyText(page, FURTHER_ACTION_PARA_2, 5)
    await checkBodyText(page, FURTHER_ACTION_PARA_3, 5)
    expect((await uploadSummaryLogPage.goToReportsButton().count()) > 0).toBe(
      true
    )
    await uploadSummaryLogPage.goToReportsButton().click()
    // The caption names the material of the one registration this operator
    // holds, so it is that registration's reports and not just a reports page.
    const reportsPage = new ReportsPage(page)
    await reportsPage.expectListFor(FIXTURE_YEAR)
    expect(await reportsPage.captionText()).toBe('Paper and board')

    // --- The restated quarter asks for resubmission ---
    const reportViewPage = new ReportViewPage(page)
    const resubmissionExplainerPage = new ResubmissionExplainerPage(page)
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

    expect(await reportsPage.getActiveStatusBadge(1)).toBe(
      'Requires resubmission'
    )

    // --- Resubmission explainer ---
    // Clicking the CTA by its label also asserts it reads "Review and create
    // draft" (a wrong label leaves nothing to click).
    await reportsPage.selectActiveActionLinkByText(1, 'Review and create draft')
    // Closed-period-restated copy: the heading keeps the "Why" prefix (the
    // operator-initiated variant in report.make.changes.e2e.js drops it) and
    // para 1 explains the summary log data changed after the report was
    // submitted.
    expect(await resubmissionExplainerPage.headingText()).toMatch(
      /^Why your .+ report needs to be resubmitted$/
    )
    await checkBodyText(
      page,
      'Your summary log data for this period has been changed since the report was submitted to your regulator.',
      10
    )
    await checkBodyText(page, 'You need to create a new draft report', 10)
    await resubmissionExplainerPage.continue()

    // --- Summary log data preview: create the draft ---
    expect(await reportDetailPage.headingText()).toContain(
      'Your summary log data'
    )
    await reportDetailPage.useThisData()

    // Creating the draft redirects into the wizard at the first data page.
    expect(await tonnesRecycledPage.headingText()).toBeTruthy()

    // --- Intermediate stage: revisit the landing before submitting ---
    // The draft now exists but is not yet ready to submit, so the period keeps
    // its "Requires resubmission" status and the CTA becomes "Continue".
    await tonnesRecycledPage.backLink().click()
    expect(await reportsPage.getActiveStatusBadge(1)).toBe(
      'Requires resubmission'
    )

    // --- Resume and complete the draft ---
    // Clicking by label also asserts the CTA has flipped to "Continue".
    await reportsPage.selectActiveActionLinkByText(1, 'Continue')
    await tonnesRecycledPage.enterTonnage('12.50')
    await tonnesRecycledPage.continue()
    await tonnesNotRecycledPage.enterTonnage('7.50')
    await tonnesNotRecycledPage.continue()

    // Supporting information shows the resubmission-variant heading.
    expect(await reportSupportingInformationPage.headingText()).toBe(
      'Add supporting information to help your regulator'
    )
    await reportSupportingInformationPage.continue()

    await reportCheckAnswersPage.createReport()

    // --- Confirmation: resubmission variant keeps the resubmission status ---
    await checkBodyText(page, 'draft report created', 30)
    await checkBodyText(page, 'Requires resubmission', 10)
    await checkBodyText(page, 'as soon as possible', 10)
    await confirmationPage.goToReports().click()

    // --- End state: status unchanged, CTA flips to "Review and submit" and the
    // original submitted report remains visible in the Submitted table. ---
    expect(await reportsPage.getActiveStatusBadge(1)).toBe(
      'Requires resubmission'
    )
    await reportsPage.expectActiveActionLink(1, 'Review and submit')
    expect(await reportsPage.getSubmittedStatusBadge(1)).toBe('Submitted')

    // --- Review and submit the resubmission ---
    await reportsPage.selectActiveActionLinkByText(1, 'Review and submit')

    // The heading reads "Resubmit report for {period}" (not "Submit report
    // for …") and the Details status reads "Requires resubmission" (not
    // "Ready to submit").
    expect(await monthlyReportDraftDeclarationPage.headingText()).toContain(
      'Resubmit report for'
    )
    expect(await monthlyReportDraftDeclarationPage.statusTag()).toBe(
      'Requires resubmission'
    )

    await monthlyReportDraftDeclarationPage.confirmAndSubmit()

    expect(await reportSubmittedPage.confirmationText()).toContain(
      'report submitted to regulator'
    )
    await reportSubmittedPage.returnToReportsLink().click()

    // --- End state: the backend folds the resubmission into a single submitted
    // item, so the period moves into the Submitted table tagged "Resubmitted"
    // (green) with a "View" link, and leaves Action required entirely. ---
    expect(await reportsPage.getSubmittedStatusBadge(1)).toBe('Resubmitted')
    expect(await reportsPage.getSubmittedStatusColour(1)).toBe('green')
    await reportsPage.expectSubmittedActionLink(1, 'View')

    // The "View" CTA opens the resubmission, not the superseded report: it
    // shows the tonnages entered above and not the 100 the first held.
    await reportsPage.selectSubmittedActionLink(1)
    await checkBodyText(page, '12.50', 10)
    await checkBodyText(page, '7.50', 10)
    await checkBodyTextDoesNotInclude(page, '100.00', 10)
    await reportViewPage.backLink().click()

    await checkBodyTextDoesNotInclude(page, 'Requires resubmission', 10)
    const activeTableText = await reportsPage.activeTableText()
    expect(activeTableText).not.toContain('Ready to submit')
    expect(activeTableText).not.toContain('Quarter 1')

    await homePage.signOutLink().click()
    await expect(page).toHaveTitle(/Signed out/)
  })

  // The "no closed-period adjustments detected" control case used to live
  // here, but its org/upload setup was byte-for-byte identical to
  // summarylogs.exporter.e2e.js's happy-path test, just to assert the
  // banner/messaging is absent — merged there instead of paying for a second
  // identical org+login+upload cycle.
})
