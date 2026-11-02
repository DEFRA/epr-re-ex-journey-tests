import { test, expect } from '@playwright/test'
import { HomePage } from 'page-objects/homepage.js'
import { UploadSummaryLogPage } from '../page-objects/upload.summary.log.page.js'
import { CheckSummaryLogPage } from '../page-objects/check.summary.log.page.js'
import { WasteRecordsPage } from '../page-objects/waste.records.page.js'
import { DashboardPage } from '../page-objects/dashboard.page.js'
import { ReportsPage } from 'page-objects/reports/reports.page.js'
import { ReportViewPage } from 'page-objects/reports/report.view.page.js'
import { ResubmissionExplainerPage } from 'page-objects/reports/resubmission.explainer.page.js'
import { ReportDetailPage } from 'page-objects/reports/report.detail.page.js'
import { PrnSummaryPage } from '../page-objects/reports/prn.summary.page.js'
import { FreePernPage } from '../page-objects/reports/free.perns.page.js'
import { ReportSupportingInformationPage } from 'page-objects/reports/report.supporting.information.page.js'
import { ReportCheckAnswersPage } from 'page-objects/reports/report.check.answers.page.js'
import { ConfirmationPage } from 'page-objects/reports/confirmation.page.js'
import { MonthlyReportDraftDeclarationPage } from 'page-objects/reports/monthly.report.draft.declaration.page.js'
import { ReportSubmittedPage } from 'page-objects/reports/report.submitted.page.js'
import {
  checkBodyText,
  checkBodyTextDoesNotInclude
} from '../support/checks.js'
import { checkOnCheckPage } from '../support/summary-log-checks.js'
import {
  seedOverseasSites,
  createLinkedOrganisation,
  fillerNumbers,
  updateMigratedOrganisation
} from '../support/seeding/organisation.js'
import { seedSubmittedReport } from '../support/seeding/reports.js'
import {
  summaryLogNumbered,
  summaryLogWithCellChanged
} from '../support/seeding/summary-logs.js'
import { generateNumbers } from '../support/reg-acc-number.js'
import { createLinkAndLogin } from '../support/login-helper.js'

// The adjusted-loads accordion splits each balance-affecting load by the
// direction it moved the waste balance: added loads carry this heading.
const ADJUSTED_ADDED_HEADING = 'This load has added to your waste balance'
const FURTHER_ACTION_HEADING = 'Further action needed'

// Three summary log uploads, each waiting on processing, then the whole
// resubmission: this journey runs well past the suite's two-minute default.
const JOURNEY_TIMEOUT_MS = 4 * 60 * 1000

// The seeded report's PERN revenue. Distinctive, so that its absence from the
// resubmitted report says the view shows the resubmission and not the report
// it superseded.
const SEEDED_PRN_REVENUE = 4321
const RESUBMITTED_PRN_REVENUE = '250.75'

test.describe('Reports - requires resubmission @requiresResubmission', () => {
  test('asks for resubmission only once an amended closed-period load changes the reported figures, then creates, reviews and submits the resubmission, ending as Resubmitted on the reports landing @requiresResubmissionStatus @reviewAndSubmit @cmaAdjusted @closedPeriodMessaging @cma', async ({
    page
  }) => {
    test.setTimeout(JOURNEY_TIMEOUT_MS)

    const homePage = new HomePage(page)
    const uploadSummaryLogPage = new UploadSummaryLogPage(page)
    const checkSummaryLogPage = new CheckSummaryLogPage(page)
    const wasteRecordsPage = new WasteRecordsPage(page)
    const dashboardPage = new DashboardPage(page)
    const reportsPage = new ReportsPage(page)
    const reportViewPage = new ReportViewPage(page)
    const resubmissionExplainerPage = new ResubmissionExplainerPage(page)
    const reportDetailPage = new ReportDetailPage(page)
    const prnSummaryPage = new PrnSummaryPage(page)
    const freePernPage = new FreePernPage(page)
    const reportSupportingInformationPage = new ReportSupportingInformationPage(
      page
    )
    const reportCheckAnswersPage = new ReportCheckAnswersPage(page)
    const confirmationPage = new ConfirmationPage(page)
    const monthlyReportDraftDeclarationPage =
      new MonthlyReportDraftDeclarationPage(page)
    const reportSubmittedPage = new ReportSubmittedPage(page)

    const organisationDetails = await createLinkedOrganisation([
      { material: 'Paper or board (R3)', wasteProcessingType: 'Reprocessor' },
      { material: 'Paper or board (R3)', wasteProcessingType: 'Exporter' }
    ])
    const exporterNumbers = generateNumbers({
      wasteProcessingType: 'exporter',
      materialSuffix: 'PA'
    })

    const migrationResponse = await updateMigratedOrganisation(
      organisationDetails.refNo,
      [
        {
          reprocessingType: 'output',
          ...fillerNumbers(),
          status: 'approved'
        },
        {
          ...exporterNumbers,
          status: 'approved',
          validFrom: '2026-01-01'
        }
      ]
    )
    await seedOverseasSites(
      organisationDetails.refNo,
      [1],
      [124, 183, 512, 876]
    )

    const user = await createLinkAndLogin(
      page,
      organisationDetails.refNo,
      migrationResponse.email
    )

    const navigateToExporterReports = async () => {
      await dashboardPage.exportingTabLink().click()
      await dashboardPage.selectLink(1)
      await wasteRecordsPage.manageReportsLink().click()
    }

    await dashboardPage.exportingTabLink().click()
    await dashboardPage.selectLink(1)

    const exporterSummaryLog = await summaryLogNumbered(
      'resources/exporter.xlsx',
      exporterNumbers
    )
    await wasteRecordsPage.submitSummaryLogLink().click()
    await uploadSummaryLogPage.performUploadAndReturnToHomepage(
      exporterSummaryLog
    )

    // Precondition: a submitted report for January.
    const exporterRegId = migrationResponse.registrationIds[1]
    await seedSubmittedReport(
      organisationDetails.refNo,
      exporterRegId,
      user.userId,
      2026,
      'monthly',
      1,
      1,
      { prnRevenue: SEEDED_PRN_REVENUE, freeTonnage: 0 }
    )

    // --- An amendment the report never reads ---
    // The report never reads a vehicle registration, so this closed-month edit
    // must not ask for resubmission.
    const vehicleRegistrationEdit = {
      sheet: 'Exported (sections 1, 2 and 3)',
      rowId: 1002,
      column: 'CARRIER_VEHICLE_REGISTRATION_NUMBER',
      value: 'AB12 CDE'
    }

    await dashboardPage.exportingTabLink().click()
    await dashboardPage.selectLink(1)
    await wasteRecordsPage.submitSummaryLogLink().click()
    await uploadSummaryLogPage.uploadFile(
      await summaryLogWithCellChanged(
        exporterSummaryLog,
        vehicleRegistrationEdit
      )
    )
    await uploadSummaryLogPage.continue()

    await checkBodyText(page, 'Your summary log is being checked', 30)
    await checkOnCheckPage(page)
    await checkBodyText(page, 'Closed periods: adjusted loads', 30)
    expect(await checkSummaryLogPage.importantBanner().count()).toBe(0)

    await checkSummaryLogPage.uploadButton().click()
    await uploadSummaryLogPage.checkUploaded()
    await checkBodyTextDoesNotInclude(page, FURTHER_ACTION_HEADING, 5)

    await uploadSummaryLogPage.returnToHomePageLink().click()
    await navigateToExporterReports()
    // Anchors the absence check: an error page would pass it alone.
    expect(await reportsPage.getSubmittedStatusBadge(1)).toBe('Submitted')
    await checkBodyTextDoesNotInclude(page, 'Requires resubmission', 5)

    // --- An amendment that changes the reported figures ---
    // Carrying the same edit isolates the real amendments from it.
    await homePage.homeLink().click()
    await dashboardPage.exportingTabLink().click()
    await dashboardPage.selectLink(1)
    await wasteRecordsPage.submitSummaryLogLink().click()
    await uploadSummaryLogPage.uploadFile(
      await summaryLogWithCellChanged(
        await summaryLogNumbered(
          'resources/exporter-adjustments.xlsx',
          exporterNumbers
        ),
        vehicleRegistrationEdit
      )
    )
    await uploadSummaryLogPage.continue()

    await checkBodyText(page, 'Your summary log is being checked', 30)
    await checkOnCheckPage(page)

    await checkBodyText(page, 'Closed periods: adjusted loads', 30)
    expect(await checkSummaryLogPage.importantBanner().count()).toBe(1)

    const sections = await checkSummaryLogPage.allSectionHeadings()
    expect(sections).toEqual(
      expect.arrayContaining([
        'Open periods: new loads',
        'Closed periods: new loads',
        'Closed periods: adjusted loads'
      ])
    )

    const subStates = (await checkSummaryLogPage.allSubStateHeadings()).join(
      ' | '
    )
    expect(subStates).toContain(
      '1 new load will be recorded (and will add to your waste balance)'
    )
    expect(subStates).toContain(
      '2 new loads will be recorded (and will add to your waste balance)'
    )
    expect(subStates).toContain(
      '1 new load will be recorded (but will NOT add to your waste balance)'
    )
    expect(subStates).toContain(
      '1 adjusted load will be recorded (and will reflect in your waste balance)'
    )
    expect(subStates).toContain(
      '1 change is NOT relevant to your waste balance'
    )

    // Guard on the projection (renders last, at page bottom) so the raw read
    // below isn't taken mid-parse; the expect()s keep the value diagnostics.
    await checkBodyText(
      page,
      'If you upload this summary log to create a new report, your waste balance will be 139.00 (from 30.00)',
      10
    )
    const bodyText = await page.evaluate(() => document.body.innerText)
    // Open and closed new-loads sections each render their own caption, so two
    // "new loads will add" lines are expected here, not one.
    expect(bodyText).toContain(
      'The new loads will add 49.00 tonnes to your waste balance.'
    )
    expect(bodyText).toContain(
      'The new loads will add 50.00 tonnes to your waste balance.'
    )
    expect(bodyText).toContain(
      'The adjusted loads will add 10.00 tonnes to your waste balance.'
    )
    expect(bodyText).toContain(
      'The loads include all the required summary log data.'
    )
    expect(bodyText).toContain('depending on the adjustment.')
    expect(bodyText).toContain(
      'If you upload this summary log to create a new report, your waste balance will be 139.00 (from 30.00)'
    )

    await checkSummaryLogPage.expandAllLoadDetails()
    const rows = await checkSummaryLogPage.loadRowItems()
    expect(rows.some((r) => r.includes('Row ID'))).toBe(true)
    const detailsText = await checkSummaryLogPage.loadDetailsText()
    expect(detailsText).toContain(ADJUSTED_ADDED_HEADING)

    // The figure change must flag the report seeded from this same log.
    await checkSummaryLogPage.uploadButton().click()
    await uploadSummaryLogPage.checkUploaded()
    await uploadSummaryLogPage.returnToHomePageLink().click()

    // The Reports landing page now shows a "Requires resubmission" entry for the
    // restated period, with a "Review and create draft" call to action.
    await navigateToExporterReports()
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
    const explainerHeading = await resubmissionExplainerPage.headingText()
    expect(explainerHeading).toMatch(
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
    expect(await prnSummaryPage.headingText()).toBeTruthy()

    // --- Intermediate stage: revisit the landing before submitting ---
    // The draft now exists but is not yet ready to submit, so the period keeps
    // its "Requires resubmission" status and the CTA becomes "Continue".
    await prnSummaryPage.backLink().click()
    expect(await reportsPage.getActiveStatusBadge(1)).toBe(
      'Requires resubmission'
    )

    // --- Resume and complete the draft ---
    // Clicking by label also asserts the CTA has flipped to "Continue".
    await reportsPage.selectActiveActionLinkByText(1, 'Continue')
    await prnSummaryPage.enterRevenue(RESUBMITTED_PRN_REVENUE)
    await prnSummaryPage.continue()
    await freePernPage.enterTonnage('0')
    await freePernPage.continue()

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

    // The "View" CTA opens the resubmission (the latest submitted report),
    // not the superseded one: it shows the revenue entered above and not the
    // revenue the first submission held.
    await reportsPage.selectSubmittedActionLink(1)
    await checkBodyText(page, RESUBMITTED_PRN_REVENUE, 10)
    await checkBodyTextDoesNotInclude(page, '4,321', 10)
    await checkBodyTextDoesNotInclude(page, `${SEEDED_PRN_REVENUE}`, 10)
    await reportViewPage.backLink().click()

    // The period is gone from Action required: the purple "Requires
    // resubmission" status no longer appears anywhere on the landing page, and
    // the erstwhile "Ready to submit" draft does not linger in the Action
    // required table (the restated January period must not reappear there).
    await checkBodyTextDoesNotInclude(page, 'Requires resubmission', 10)
    const activeTableText = await reportsPage.activeTableText()
    expect(activeTableText).not.toContain('Ready to submit')
    expect(activeTableText).not.toContain('January')

    await homePage.signOutLink().click()
    await expect(page).toHaveTitle(/Signed out/)
  })
})
