import { browser, expect } from '@wdio/globals'
import DefraIdStubPage from 'page-objects/defra.id.stub.page.js'
import HomePage from 'page-objects/homepage.js'
import UploadSummaryLogPage from '../page-objects/upload.summary.log.page.js'
import EnhancedCheckSummaryLogPage from '../page-objects/enhanced.check.summary.log.page.js'
import WasteRecordsPage from '../page-objects/waste.records.page.js'
import DashboardPage from '../page-objects/dashboard.page.js'
import ReportsPage from 'page-objects/reports/reports.page.js'
import ResubmissionExplainerPage from 'page-objects/reports/resubmission.explainer.page.js'
import ReportDetailPage from 'page-objects/reports/report.detail.page.js'
import TonnesRecycledPage from 'page-objects/reports/tonnes.recycled.page.js'
import TonnesNotRecycledPage from 'page-objects/reports/tonnes.not.recycled.page.js'
import ReportSupportingInformationPage from 'page-objects/reports/report.supporting.information.page.js'
import ReportCheckAnswersPage from 'page-objects/reports/report.check.answers.page.js'
import ConfirmationPage from 'page-objects/reports/confirmation.page.js'
import MonthlyReportDraftDeclarationPage from 'page-objects/reports/monthly.report.draft.declaration.page.js'
import ReportSubmittedPage from 'page-objects/reports/report.submitted.page.js'
import {
  checkBodyText,
  checkBodyTextDoesNotInclude
} from '../support/checks.js'
import {
  createAndRegisterDefraIdUser,
  createLinkedOrganisation,
  linkDefraIdUser,
  updateMigratedOrganisation,
  seedSubmittedReport
} from '../support/apicalls.js'

describe('Reports - requires resubmission @requiresResubmission', () => {
  // Reset the shared browser session between tests so leftover auth state does
  // not auto-log-in and skip the stub's user-selection page (see CMA spec).
  afterEach(async () => {
    await browser.reloadSession()
  })

  it('creates, reviews and submits a resubmission draft from a restated closed period, ending as Resubmitted on the reports landing @requiresResubmissionStatus @reviewAndSubmit @cma', async () => {
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

    const user = await createAndRegisterDefraIdUser(migrationResponse.email)
    await linkDefraIdUser(
      organisationDetails.refNo,
      user.userId,
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

    await HomePage.open()
    await HomePage.clickStartNow()
    await DefraIdStubPage.loginViaEmail(migrationResponse.email)

    await DashboardPage.selectLink(1)
    await WasteRecordsPage.submitSummaryLogLink()

    // Upload a summary log that restates the closed Q1 2026 period, and confirm
    // it. On submit the backend flags that period's report for resubmission.
    await UploadSummaryLogPage.uploadFile(
      'resources/reprocessor-output-regonly-cma.xlsx'
    )
    await UploadSummaryLogPage.continue()
    await checkBodyText('Your summary log is being checked', 30)
    await checkBodyText('Upload your summary log', 60)
    await checkBodyText('Closed periods: new loads', 30)

    await EnhancedCheckSummaryLogPage.upload()
    await checkBodyText('Your waste records are being updated', 30)
    await checkBodyText('Summary log uploaded', 60)
    await UploadSummaryLogPage.clickOnReturnToHomePage()

    // The Reports landing page now shows a "Requires resubmission" entry for the
    // restated period, with a "Review and create draft" call to action.
    await DashboardPage.selectLink(1)
    await WasteRecordsPage.manageReportsLink()
    expect(await ReportsPage.getActiveStatusBadge(1)).toBe(
      'Requires resubmission'
    )
    // --- Resubmission explainer ---
    // Clicking the CTA by its label also asserts it reads "Review and create
    // draft" (a wrong label leaves nothing to click).
    await ReportsPage.selectActiveActionLinkByText(1, 'Review and create draft')
    expect(await ResubmissionExplainerPage.headingText()).toContain(
      'needs to be resubmitted'
    )
    await checkBodyText('You need to create a new draft report', 10)
    await ResubmissionExplainerPage.continue()

    // --- Summary log data preview: create the draft ---
    expect(await ReportDetailPage.headingText()).toContain(
      'Your summary log data'
    )
    await ReportDetailPage.useThisData()

    // Creating the draft redirects into the wizard at the first data page.
    expect(await TonnesRecycledPage.headingText()).toBeTruthy()

    // --- Intermediate stage: revisit the landing before submitting ---
    // The draft now exists but is not yet ready to submit, so the period keeps
    // its "Requires resubmission" status and the CTA becomes "Continue".
    await TonnesRecycledPage.selectBackLink()
    expect(await ReportsPage.getActiveStatusBadge(1)).toBe(
      'Requires resubmission'
    )
    // --- Resume and complete the draft ---
    // Clicking by label also asserts the CTA has flipped to "Continue".
    await ReportsPage.selectActiveActionLinkByText(1, 'Continue')
    await TonnesRecycledPage.enterTonnage('12.50')
    await TonnesRecycledPage.continue()
    await TonnesNotRecycledPage.enterTonnage('7.50')
    await TonnesNotRecycledPage.continue()

    // Supporting information shows the resubmission-variant heading.
    expect(await ReportSupportingInformationPage.headingText()).toBe(
      'Add supporting information to help your regulator'
    )
    await ReportSupportingInformationPage.continue()

    await ReportCheckAnswersPage.createReport()

    // --- Confirmation: resubmission variant keeps the resubmission status ---
    await checkBodyText('draft report created', 30)
    await checkBodyText('Requires resubmission', 10)
    await checkBodyText('as soon as possible', 10)
    await ConfirmationPage.goToReports()

    // --- End state: status unchanged, CTA flips to "Review and submit" and the
    // original submitted report remains visible in the Submitted table. ---
    expect(await ReportsPage.getActiveStatusBadge(1)).toBe(
      'Requires resubmission'
    )
    await ReportsPage.expectActiveActionLink(1, 'Review and submit')
    expect(await ReportsPage.getSubmittedStatusBadge(1)).toBe('Submitted')

    // --- Review and submit the resubmission ---
    // Clicking by label also asserts the CTA reads "Review and submit".
    await ReportsPage.selectActiveActionLinkByText(1, 'Review and submit')

    // Review page is the resubmission variant of the submit page: the heading
    // reads "Resubmit report for {period}" (not "Submit report for …") and the
    // Details status reads "Requires resubmission" (not "Ready to submit").
    expect(await MonthlyReportDraftDeclarationPage.headingText()).toContain(
      'Resubmit report for'
    )
    expect(await MonthlyReportDraftDeclarationPage.statusTag()).toBe(
      'Requires resubmission'
    )

    // Enter the declarant name and submit.
    await MonthlyReportDraftDeclarationPage.confirmAndSubmit()

    expect(await ReportSubmittedPage.confirmationText()).toContain(
      'report submitted to regulator'
    )
    await ReportSubmittedPage.returnToReportsLink()

    // --- End state: the backend folds the resubmission into a single submitted
    // item, so the period moves into the Submitted table tagged "Resubmitted"
    // (green) with a "View report" link, and leaves Action required entirely. ---
    expect(await ReportsPage.getSubmittedStatusBadge(1)).toBe('Resubmitted')
    expect(await ReportsPage.getSubmittedStatusColour(1)).toBe('green')
    await ReportsPage.expectSubmittedActionLink(1, 'View report')

    // The "View report" CTA opens the resubmission (submission 2 — the latest
    // submitted report), not the superseded submission 1.
    expect(await ReportsPage.getSubmittedActionLinkHref(1)).toContain(
      '/submissions/2/view'
    )

    // The period is gone from Action required: the purple "Requires
    // resubmission" status no longer appears anywhere on the landing page, and
    // the erstwhile "Ready to submit" draft does not linger in the Action
    // required table (the restated Quarter 1 period must not reappear there).
    await checkBodyTextDoesNotInclude('Requires resubmission', 10)
    const activeTableText = await ReportsPage.activeTableText()
    expect(activeTableText).not.toContain('Ready to submit')
    expect(activeTableText).not.toContain('Quarter 1')

    await HomePage.signOut()
    await expect(browser).toHaveTitle(expect.stringContaining('Signed out'))
  })
})
