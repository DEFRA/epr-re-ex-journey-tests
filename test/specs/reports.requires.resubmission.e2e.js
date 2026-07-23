import { test, expect } from '@playwright/test'
import { HomePage } from 'page-objects/homepage.js'
import { UploadSummaryLogPage } from '../page-objects/upload.summary.log.page.js'
import { CheckSummaryLogPage } from '../page-objects/check.summary.log.page.js'
import { WasteRecordsPage } from '../page-objects/waste.records.page.js'
import { DashboardPage } from '../page-objects/dashboard.page.js'
import { ReportsPage } from 'page-objects/reports/reports.page.js'
import { ResubmissionExplainerPage } from 'page-objects/reports/resubmission.explainer.page.js'
import { ReportDetailPage } from 'page-objects/reports/report.detail.page.js'
import { TonnesRecycledPage } from 'page-objects/reports/tonnes.recycled.page.js'
import { TonnesNotRecycledPage } from 'page-objects/reports/tonnes.not.recycled.page.js'
import { ReportSupportingInformationPage } from 'page-objects/reports/report.supporting.information.page.js'
import { ReportCheckAnswersPage } from 'page-objects/reports/report.check.answers.page.js'
import { ConfirmationPage } from 'page-objects/reports/confirmation.page.js'
import { MonthlyReportDraftDeclarationPage } from 'page-objects/reports/monthly.report.draft.declaration.page.js'
import { ReportSubmittedPage } from 'page-objects/reports/report.submitted.page.js'
import {
  checkBodyText,
  checkBodyTextDoesNotInclude
} from '../support/checks.js'
import {
  createLinkedOrganisation,
  updateMigratedOrganisation,
  seedSubmittedReport
} from '../support/apicalls.js'
import {
  registerAndLinkDefraIdUser,
  loginViaHomePage
} from '../support/login-helper.js'

test.describe('Reports - requires resubmission @requiresResubmission', () => {
  test('creates, reviews and submits a resubmission draft from a restated closed period, ending as Resubmitted on the reports landing @requiresResubmissionStatus @reviewAndSubmit @cma', async ({
    page
  }) => {
    const homePage = new HomePage(page)
    const uploadSummaryLogPage = new UploadSummaryLogPage(page)
    const checkSummaryLogPage = new CheckSummaryLogPage(page)
    const dashboardPage = new DashboardPage(page)
    const wasteRecordsPage = new WasteRecordsPage(page)
    const reportsPage = new ReportsPage(page)
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
          regNumber: 'R25SR500040912PA',
          status: 'approved',
          withoutAccreditation: true
        }
      ]
    )

    const user = await registerAndLinkDefraIdUser(
      organisationDetails.refNo,
      migrationResponse.email
    )

    const regId = migrationResponse.registrationIds[0]

    // Precondition: a submitted (closed) report for Q1 2026.
    await seedSubmittedReport(
      organisationDetails.refNo,
      regId,
      user.userId,
      2026,
      'quarterly',
      1,
      1,
      { tonnageRecycled: 100, tonnageNotRecycled: 0 }
    )

    await loginViaHomePage(page, migrationResponse.email)

    await dashboardPage.selectLink(1)
    await wasteRecordsPage.submitSummaryLogLink()

    // Upload a summary log that restates the closed Q1 2026 period, and confirm
    // it. On submit the backend flags that period's report for resubmission.
    await uploadSummaryLogPage.uploadFile(
      'resources/reprocessor-output-regonly-cma.xlsx'
    )
    await uploadSummaryLogPage.continue()
    await checkBodyText(page, 'Your summary log is being checked', 30)
    await checkBodyText(page, 'Upload your summary log', 60)
    await checkBodyText(page, 'Closed periods: new loads', 30)

    await checkSummaryLogPage.upload()
    await checkBodyText(page, 'Your waste records are being updated', 30)
    await checkBodyText(page, 'Summary log uploaded', 60)
    await uploadSummaryLogPage.clickOnReturnToHomePage()

    // The Reports landing page now shows a "Requires resubmission" entry for the
    // restated period, with a "Review and create draft" call to action.
    await dashboardPage.selectLink(1)
    await wasteRecordsPage.manageReportsLink()
    expect(await reportsPage.getActiveStatusBadge(1)).toBe(
      'Requires resubmission'
    )
    // --- Resubmission explainer ---
    // Clicking the CTA by its label also asserts it reads "Review and create
    // draft" (a wrong label leaves nothing to click).
    await reportsPage.selectActiveActionLinkByText(1, 'Review and create draft')
    expect(await resubmissionExplainerPage.headingText()).toContain(
      'needs to be resubmitted'
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
    await tonnesRecycledPage.selectBackLink()
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
    await confirmationPage.goToReports()

    // --- End state: status unchanged, CTA flips to "Review and submit" and the
    // original submitted report remains visible in the Submitted table. ---
    expect(await reportsPage.getActiveStatusBadge(1)).toBe(
      'Requires resubmission'
    )
    await reportsPage.expectActiveActionLink(1, 'Review and submit')
    expect(await reportsPage.getSubmittedStatusBadge(1)).toBe('Submitted')

    // --- Review and submit the resubmission ---
    // Clicking by label also asserts the CTA reads "Review and submit".
    await reportsPage.selectActiveActionLinkByText(1, 'Review and submit')

    // Review page is the resubmission variant of the submit page: the heading
    // reads "Resubmit report for {period}" (not "Submit report for …") and the
    // Details status reads "Requires resubmission" (not "Ready to submit").
    expect(await monthlyReportDraftDeclarationPage.headingText()).toContain(
      'Resubmit report for'
    )
    expect(await monthlyReportDraftDeclarationPage.statusTag()).toBe(
      'Requires resubmission'
    )

    // Enter the declarant name and submit.
    await monthlyReportDraftDeclarationPage.confirmAndSubmit()

    expect(await reportSubmittedPage.confirmationText()).toContain(
      'report submitted to regulator'
    )
    await reportSubmittedPage.returnToReportsLink()

    // --- End state: the backend folds the resubmission into a single submitted
    // item, so the period moves into the Submitted table tagged "Resubmitted"
    // (green) with a "View report" link, and leaves Action required entirely. ---
    expect(await reportsPage.getSubmittedStatusBadge(1)).toBe('Resubmitted')
    expect(await reportsPage.getSubmittedStatusColour(1)).toBe('green')
    await reportsPage.expectSubmittedActionLink(1, 'View report')

    // The "View report" CTA opens the resubmission (submission 2 — the latest
    // submitted report), not the superseded submission 1.
    expect(await reportsPage.getSubmittedActionLinkHref(1)).toContain(
      '/submissions/2/view'
    )

    // The period is gone from Action required: the purple "Requires
    // resubmission" status no longer appears anywhere on the landing page, and
    // the erstwhile "Ready to submit" draft does not linger in the Action
    // required table (the restated Quarter 1 period must not reappear there).
    await checkBodyTextDoesNotInclude(page, 'Requires resubmission', 10)
    const activeTableText = await reportsPage.activeTableText()
    expect(activeTableText).not.toContain('Ready to submit')
    expect(activeTableText).not.toContain('Quarter 1')

    await homePage.signOut()
    await expect(page).toHaveTitle(/Signed out/)
  })
})
