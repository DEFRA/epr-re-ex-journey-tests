import { test, expect } from '@playwright/test'
import { HomePage } from 'page-objects/homepage.js'
import { DashboardPage } from 'page-objects/dashboard.page.js'
import { WasteRecordsPage } from 'page-objects/waste.records.page.js'
import { UploadSummaryLogPage } from 'page-objects/upload.summary.log.page.js'
import { CheckSummaryLogPage } from 'page-objects/check.summary.log.page.js'
import { ReportsPage } from 'page-objects/reports/reports.page.js'
import { ReportDetailPage } from 'page-objects/reports/report.detail.page.js'
import { TonnesNotExportedPage } from 'page-objects/reports/tonnes.not.exported.page.js'
import { TonnesRecycledPage } from 'page-objects/reports/tonnes.recycled.page.js'
import { TonnesNotRecycledPage } from 'page-objects/reports/tonnes.not.recycled.page.js'
import { ReprocessorPrnSummaryPage } from 'page-objects/reports/reprocessor.prn.summary.page.js'
import { ReportSupportingInformationPage } from 'page-objects/reports/report.supporting.information.page.js'
import { ReportCheckAnswersPage } from 'page-objects/reports/report.check.answers.page.js'
import { ConfirmationPage } from 'page-objects/reports/confirmation.page.js'
import { MonthlyReportDraftDeclarationPage } from 'page-objects/reports/monthly.report.draft.declaration.page.js'
import { ReportSubmittedPage } from 'page-objects/reports/report.submitted.page.js'
import { ConfirmDeleteReportPage } from 'page-objects/confirm.delete.report.page.js'
import { CreatePRNPage } from 'page-objects/create.prn.page.js'
import { CheckBeforeCreatingPRNPage } from 'page-objects/check.before.creating.prn.page.js'
import { PRNCreatedPage } from 'page-objects/prn.created.page.js'
import { PRNDashboardPage } from 'page-objects/prn.dashboard.page.js'
import { PRNViewPage } from 'page-objects/prn.view.page.js'
import { PRNIssuedPage } from 'page-objects/prn.issued.page.js'
import { ConfirmDeletePRNPage } from 'page-objects/confirm.delete.prn.page.js'
import { ConfirmCancelPRNPage } from 'page-objects/confirm.cancel.prn.page.js'
import { PRNCancelledPage } from 'page-objects/prn.cancelled.page.js'

import {
  createLinkedOrganisation,
  externalAPICancelPrn,
  updateMigratedOrganisation
} from '../support/apicalls.js'
import {
  assertNoSeriousOrCriticalViolations,
  scanPageForAccessibilityViolations,
  tagAccessibilityTest
} from '../support/accessibility.js'
import { checkBodyText } from '../support/checks.js'
import { createLinkAndLogin } from '../support/login-helper.js'
import {
  navigateToReports,
  uploadSummaryLogAndNavigateToReports
} from '../support/report-navigation.js'
import { tonnageWordings, tradingName } from '../support/fixtures.js'

test.describe('WCAG Accessibility', () => {
  test('Should have no Serious/Critical accessibility violations on the public entry pages @smoketest @accessibility', async ({
    page
  }) => {
    const violations = []
    const homePage = new HomePage(page)

    await tagAccessibilityTest('Public entry pages')

    await homePage.open()
    violations.push(
      ...(await scanPageForAccessibilityViolations(page, 'Home page'))
    )

    await homePage.openStart()
    violations.push(
      ...(await scanPageForAccessibilityViolations(
        page,
        'Choose your organisation (start) page'
      ))
    )

    await assertNoSeriousOrCriticalViolations(violations)
  })

  test('Should have no Serious/Critical accessibility violations across the exporter dashboard, summary log upload and report flow @accessibility', async ({
    page
  }) => {
    const violations = []
    const REG_NUMBER = 'E25SR500030913PA'

    await tagAccessibilityTest('Exporter dashboard, upload and report flow')

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

    const homePage = new HomePage(page)
    const dashboardPage = new DashboardPage(page)
    const wasteRecordsPage = new WasteRecordsPage(page)
    const uploadSummaryLogPage = new UploadSummaryLogPage(page)
    const checkSummaryLogPage = new CheckSummaryLogPage(page)
    const reportsPage = new ReportsPage(page)
    const reportDetailPage = new ReportDetailPage(page)
    const tonnesNotExportedPage = new TonnesNotExportedPage(page)
    const reportSupportingInformationPage = new ReportSupportingInformationPage(
      page
    )
    const reportCheckAnswersPage = new ReportCheckAnswersPage(page)
    const confirmationPage = new ConfirmationPage(page)
    const monthlyReportDraftDeclarationPage =
      new MonthlyReportDraftDeclarationPage(page)
    const reportSubmittedPage = new ReportSubmittedPage(page)
    const confirmDeleteReportPage = new ConfirmDeleteReportPage(page)

    // Login lands on the dashboard.
    violations.push(
      ...(await scanPageForAccessibilityViolations(page, 'Dashboard'))
    )

    await dashboardPage.selectTableLink(1, 1)
    violations.push(
      ...(await scanPageForAccessibilityViolations(page, 'Waste records'))
    )

    await wasteRecordsPage.submitSummaryLogLink()
    violations.push(
      ...(await scanPageForAccessibilityViolations(page, 'Upload summary log'))
    )

    await uploadSummaryLogPage.uploadFile('resources/exporter-regonly.xlsx')
    await uploadSummaryLogPage.continue()
    await checkBodyText(page, 'Your summary log is being checked', 30)
    await checkBodyText(page, 'Upload your summary log', 60)
    violations.push(
      ...(await scanPageForAccessibilityViolations(page, 'Check summary log'))
    )

    await checkSummaryLogPage.upload()
    await checkBodyText(page, 'Your waste records are being updated', 30)
    await checkBodyText(page, 'Summary log uploaded', 60)
    violations.push(
      ...(await scanPageForAccessibilityViolations(
        page,
        'Summary log uploaded (confirmation)'
      ))
    )

    await uploadSummaryLogPage.clickOnReturnToHomePage()
    await navigateToReports(page)
    violations.push(
      ...(await scanPageForAccessibilityViolations(page, 'Reports list'))
    )

    await reportsPage.selectActiveActionLink(1)
    violations.push(
      ...(await scanPageForAccessibilityViolations(
        page,
        'Report detail (summary log data)'
      ))
    )

    await reportDetailPage.useThisData()
    violations.push(
      ...(await scanPageForAccessibilityViolations(page, 'Tonnes not exported'))
    )

    // Detour into the delete-report confirmation page and back, so it gets
    // scanned without derailing the create/submit flow below.
    await tonnesNotExportedPage.deleteReportLink()
    violations.push(
      ...(await scanPageForAccessibilityViolations(
        page,
        'Confirm delete report'
      ))
    )
    await confirmDeleteReportPage.confirmDeletion()

    await reportsPage.selectActiveActionLink(1)
    await reportDetailPage.useThisData()
    await tonnesNotExportedPage.enterTonnage('5.50')
    await tonnesNotExportedPage.continue()
    violations.push(
      ...(await scanPageForAccessibilityViolations(
        page,
        'Supporting information'
      ))
    )

    await reportSupportingInformationPage.continue()
    violations.push(
      ...(await scanPageForAccessibilityViolations(page, 'Check your answers'))
    )

    await reportCheckAnswersPage.createReport()
    await checkBodyText(page, 'report created', 30)
    violations.push(
      ...(await scanPageForAccessibilityViolations(
        page,
        'Report created (confirmation)'
      ))
    )

    await confirmationPage.goToReports()
    await reportsPage.selectActiveActionLink(1)
    violations.push(
      ...(await scanPageForAccessibilityViolations(
        page,
        'Confirm and submit report declaration'
      ))
    )

    await monthlyReportDraftDeclarationPage.confirmAndSubmit()
    violations.push(
      ...(await scanPageForAccessibilityViolations(
        page,
        'Report submitted (confirmation)'
      ))
    )

    await reportSubmittedPage.returnToReportsLink()
    await homePage.signOut()
    await expect(page).toHaveTitle(/Signed out/)

    await assertNoSeriousOrCriticalViolations(violations)
  })

  test('Should have no Serious/Critical accessibility violations across the accredited reprocessor report and PRN flow @accessibility', async ({
    page
  }) => {
    const violations = []
    const REG_NUMBER = 'R25SR500010912PA'
    const ACC_NUMBER = 'R-ACC12145PA'

    await tagAccessibilityTest('Accredited reprocessor report and PRN flow')

    const organisationDetails = await createLinkedOrganisation([
      { material: 'Paper or board (R3)', wasteProcessingType: 'Reprocessor' }
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

    const homePage = new HomePage(page)
    const dashboardPage = new DashboardPage(page)
    const wasteRecordsPage = new WasteRecordsPage(page)
    const reportsPage = new ReportsPage(page)
    const reportDetailPage = new ReportDetailPage(page)
    const tonnesRecycledPage = new TonnesRecycledPage(page)
    const tonnesNotRecycledPage = new TonnesNotRecycledPage(page)
    const reprocessorPrnSummaryPage = new ReprocessorPrnSummaryPage(page)
    const createPRNPage = new CreatePRNPage(page)
    const checkBeforeCreatingPRNPage = new CheckBeforeCreatingPRNPage(page)
    const prnCreatedPage = new PRNCreatedPage(page)
    const prnDashboardPage = new PRNDashboardPage(page)
    const prnViewPage = new PRNViewPage(page)
    const prnIssuedPage = new PRNIssuedPage(page)
    const confirmDeletePRNPage = new ConfirmDeletePRNPage(page)
    const confirmCancelPrnPage = new ConfirmCancelPRNPage(page)
    const prnCancelledPage = new PRNCancelledPage(page)

    await uploadSummaryLogAndNavigateToReports(
      page,
      `resources/sanity/reprocessorOutput_${ACC_NUMBER}_${REG_NUMBER}.xlsx`
    )

    // --- Report wizard pages unique to the accredited reprocessor flow ---
    await reportsPage.selectActiveActionLink(1)
    await reportDetailPage.useThisData()
    violations.push(
      ...(await scanPageForAccessibilityViolations(page, 'Tonnes recycled'))
    )

    await tonnesRecycledPage.enterTonnage('15.02')
    await tonnesRecycledPage.continue()
    violations.push(
      ...(await scanPageForAccessibilityViolations(page, 'Tonnes not recycled'))
    )

    await tonnesNotRecycledPage.enterTonnage('89.31')
    await tonnesNotRecycledPage.continue()
    violations.push(
      ...(await scanPageForAccessibilityViolations(
        page,
        'Reprocessor PRN summary'
      ))
    )

    await reprocessorPrnSummaryPage.enterRevenue('1576.12')
    await reprocessorPrnSummaryPage.continue()
    violations.push(
      ...(await scanPageForAccessibilityViolations(page, 'Free PRNs'))
    )

    // Abandon the draft report here (report submission is already covered by
    // the exporter flow above) and move on to the PRN pages. Navigate back to
    // the dashboard explicitly first — we're still mid-wizard on Free PRNs,
    // which has no dashboard table to click through.
    await dashboardPage.open(organisationDetails.refNo)

    // --- Waste records page for an accredited registration (PRN links) ---
    await dashboardPage.selectTableLink(1, 1)
    violations.push(
      ...(await scanPageForAccessibilityViolations(
        page,
        'Waste records (accredited reprocessor)'
      ))
    )

    // --- Create, view and delete a draft (awaiting authorisation) PRN ---
    await wasteRecordsPage.createNewPRNLink()
    violations.push(
      ...(await scanPageForAccessibilityViolations(page, 'Create PRN'))
    )

    await createPRNPage.createPrn(
      tonnageWordings.integer,
      tradingName,
      'Testing'
    )
    violations.push(
      ...(await scanPageForAccessibilityViolations(
        page,
        'Check before creating PRN'
      ))
    )

    await checkBeforeCreatingPRNPage.createPRN()
    violations.push(
      ...(await scanPageForAccessibilityViolations(page, 'PRN created'))
    )

    await prnCreatedPage.returnToRegistrationPage()
    await dashboardPage.selectTableLink(1, 1)
    await wasteRecordsPage.managePRNsLink()
    violations.push(
      ...(await scanPageForAccessibilityViolations(
        page,
        'PRN dashboard (awaiting authorisation)'
      ))
    )

    await prnDashboardPage.selectAwaitingLink(1)
    violations.push(
      ...(await scanPageForAccessibilityViolations(
        page,
        'PRN view (awaiting authorisation)'
      ))
    )

    // Detour into the delete-PRN confirmation page and back.
    await prnViewPage.deletePRNButton()
    violations.push(
      ...(await scanPageForAccessibilityViolations(page, 'Confirm delete PRN'))
    )
    await confirmDeletePRNPage.selectBackLink()

    // --- Issue the PRN, then have the recipient (RPD) reject it so the
    // cancellation confirmation pages can be scanned too ---
    await prnViewPage.issuePRNButton()
    violations.push(
      ...(await scanPageForAccessibilityViolations(page, 'PRN issued'))
    )

    const prnNumber = await prnIssuedPage.prnNumberText()
    await externalAPICancelPrn({ prnNumber })

    await prnIssuedPage.managePRNs().click()
    violations.push(
      ...(await scanPageForAccessibilityViolations(
        page,
        'PRN dashboard (awaiting cancellation)'
      ))
    )

    await prnDashboardPage.selectAwaitingLink(1)
    violations.push(
      ...(await scanPageForAccessibilityViolations(
        page,
        'PRN view (awaiting cancellation)'
      ))
    )

    await prnViewPage.cancelPRNButton()
    violations.push(
      ...(await scanPageForAccessibilityViolations(page, 'Confirm cancel PRN'))
    )

    await confirmCancelPrnPage.confirmCancelPrn()
    violations.push(
      ...(await scanPageForAccessibilityViolations(page, 'PRN cancelled'))
    )

    await prnCancelledPage.prnsPage()
    await homePage.signOut()
    await expect(page).toHaveTitle(/Signed out/)

    await assertNoSeriousOrCriticalViolations(violations)
  })
})
