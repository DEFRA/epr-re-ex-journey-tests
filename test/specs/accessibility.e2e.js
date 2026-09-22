import { test, expect } from '@playwright/test'
import { step } from 'allure-js-commons'
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
  updateMigratedOrganisation
} from '../support/seeding/organisation.js'
import { externalAPICancelPrn } from '../support/seeding/prns.js'
import { submitSummaryLogContent } from '../support/seeding/summary-logs.js'
import { summaryLogContentFromFixture } from '../support/spreadsheet/summarylogs-content-generator.js'
import {
  assertNoSeriousOrCriticalViolations,
  attachAccessibilityReport,
  createAccessibilityCollector,
  scanPageForAccessibilityViolations,
  shouldAuditWithLighthouse,
  tagAccessibilityTest
} from '../support/accessibility.js'
import { closeLighthouseChrome } from '../support/lighthouse.js'
import { checkBodyText } from '../support/checks.js'
import { createLinkAndLogin } from '../support/login-helper.js'
import { defraIdStub } from '../support/defra-id-stub.js'
import { navigateToReports } from '../support/report-navigation.js'
import { tonnageWordings, tradingName } from '../support/fixtures.js'

/**
 * Scans a page for Axe violations and, only for the file's one designated
 * Lighthouse canary (the Home page below) or when running against a real
 * deployed environment, also runs the fuller Lighthouse audit through the
 * same collector - see shouldAuditWithLighthouse for why. A machinery-level
 * break (a dead Chrome launch, a renamed audit id, a config error) shows up
 * on any page, so one canary across the whole file is enough to catch it
 * sooner than the next CDP Portal deploy without paying a full page-
 * reload-and-audit cost on every one of the ~30 pages these three tours
 * cover.
 * @param {import('@playwright/test').Page} page
 * @param {string} pageName
 * @param {ReturnType<typeof createAccessibilityCollector>} collector
 * @param {boolean} [isCanary]
 */
async function scan(page, pageName, collector, isCanary = false) {
  return scanPageForAccessibilityViolations(
    page,
    pageName,
    shouldAuditWithLighthouse(isCanary) ? collector : undefined
  )
}

test.describe('WCAG Accessibility @smoketest', () => {
  // Each test below tours a different, independently-seeded org through its
  // own `page` fixture, so nothing here needs the suite-wide serial default
  // (playwright.config.js's fullyParallel: false, left alone for every other
  // file). Lighthouse's Chrome instance (test/support/lighthouse.js) is a
  // module-level singleton, but that module state lives per worker process,
  // not per file, so parallel workers each launch their own on their own
  // free port rather than colliding. This is what lets these three
  // Lighthouse-heavy tours (the slowest file in the suite - each one is a
  // full audit-per-page) run on separate workers instead of stacking up
  // sequentially in one.
  test.describe.configure({ mode: 'parallel' })

  test.afterAll(async () => {
    await closeLighthouseChrome()
  })

  // Against a real deployed environment (CDP Portal) every page also runs
  // a Lighthouse audit alongside its Axe scan, which is slower (Lighthouse
  // does a full page reload per page) - bumped well past the suite's
  // default 2-minute ceiling to cover that. A local/PR-CI run only pays
  // that cost once, for the file's single canary page (see `scan` above),
  // but keeps the same generous ceiling regardless.
  const LIGHTHOUSE_TEST_TIMEOUT = 10 * 60 * 1000

  test('Should have no Serious/Critical accessibility violations on the public entry pages @accessibility', async ({
    page
  }) => {
    test.setTimeout(LIGHTHOUSE_TEST_TIMEOUT)
    const violations = []
    const collector = createAccessibilityCollector()
    const homePage = new HomePage(page)

    await tagAccessibilityTest('Public entry pages')

    try {
      await step('🌐 Page tour: Public entry pages', async () => {
        await homePage.open()
        violations.push(
          // The file's one Lighthouse canary - see the `scan` helper above.
          ...(await scan(page, 'Home page', collector, true))
        )

        await homePage.openStart()
        violations.push(
          ...(await scan(
            page,
            'Choose your organisation (start) page',
            collector
          ))
        )
      })
    } finally {
      // Attach whatever was collected even if the tour above threw, so a
      // mid-tour failure doesn't discard the report when it's most needed.
      await attachAccessibilityReport(collector)
    }

    await assertNoSeriousOrCriticalViolations(violations)
  })

  test('Should have no Serious/Critical accessibility violations across the exporter dashboard, summary log upload and report flow @accessibility', async ({
    page
  }) => {
    test.setTimeout(LIGHTHOUSE_TEST_TIMEOUT)
    const violations = []
    const collector = createAccessibilityCollector()
    const REG_NUMBER = 'R26EX5000000003PA'

    await tagAccessibilityTest('Exporter dashboard, upload and report flow')

    try {
      await step(
        '🌐 Page tour: Exporter dashboard, upload and report flow',
        async () => {
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
          const reportSupportingInformationPage =
            new ReportSupportingInformationPage(page)
          const reportCheckAnswersPage = new ReportCheckAnswersPage(page)
          const confirmationPage = new ConfirmationPage(page)
          const monthlyReportDraftDeclarationPage =
            new MonthlyReportDraftDeclarationPage(page)
          const reportSubmittedPage = new ReportSubmittedPage(page)
          const confirmDeleteReportPage = new ConfirmDeleteReportPage(page)

          // Login lands on the dashboard.
          violations.push(...(await scan(page, 'Dashboard', collector)))

          await dashboardPage.selectTableLink(1, 1)
          violations.push(...(await scan(page, 'Waste records', collector)))

          await wasteRecordsPage.submitSummaryLogLink().click()
          violations.push(
            ...(await scan(page, 'Upload summary log', collector))
          )

          await uploadSummaryLogPage.uploadFile(
            'resources/exporter-regonly.xlsx'
          )
          await uploadSummaryLogPage.continue()
          await checkBodyText(page, 'Your summary log is being checked', 30)
          await checkBodyText(page, 'Upload your summary log', 30)
          violations.push(...(await scan(page, 'Check summary log', collector)))

          await checkSummaryLogPage.uploadButton().click()
          await checkBodyText(page, 'Your waste records are being updated', 30)
          await checkBodyText(page, 'Summary log uploaded', 30)
          violations.push(
            ...(await scan(
              page,
              'Summary log uploaded (confirmation)',
              collector
            ))
          )

          await uploadSummaryLogPage.returnToHomePageLink().click()
          await navigateToReports(page)
          violations.push(...(await scan(page, 'Reports list', collector)))

          await reportsPage.selectActiveActionLink(1)
          violations.push(
            ...(await scan(page, 'Report detail (summary log data)', collector))
          )

          await reportDetailPage.useThisData()
          violations.push(
            ...(await scan(page, 'Tonnes not exported', collector))
          )

          // Detour into the delete-report confirmation page and back, so it gets
          // scanned without derailing the create/submit flow below.
          await tonnesNotExportedPage.deleteReportLink().click()
          violations.push(
            ...(await scan(page, 'Confirm delete report', collector))
          )
          await confirmDeleteReportPage.confirmDeletion()

          await reportsPage.selectActiveActionLink(1)
          await reportDetailPage.useThisData()
          await tonnesNotExportedPage.enterTonnage('5.50')
          await tonnesNotExportedPage.continue()
          violations.push(
            ...(await scan(page, 'Supporting information', collector))
          )

          await reportSupportingInformationPage.continue()
          violations.push(
            ...(await scan(page, 'Check your answers', collector))
          )

          await reportCheckAnswersPage.createReport()
          await checkBodyText(page, 'report created', 30)
          violations.push(
            ...(await scan(page, 'Report created (confirmation)', collector))
          )

          await confirmationPage.goToReports().click()
          await reportsPage.selectActiveActionLink(1)
          violations.push(
            ...(await scan(
              page,
              'Confirm and submit report declaration',
              collector
            ))
          )

          await monthlyReportDraftDeclarationPage.confirmAndSubmit()
          violations.push(
            ...(await scan(page, 'Report submitted (confirmation)', collector))
          )

          await reportSubmittedPage.returnToReportsLink().click()
          await homePage.signOutLink().click()
          await expect(page).toHaveTitle(/Signed out/)
        }
      )
    } finally {
      // Attach whatever was collected even if the tour above threw, so a
      // mid-tour failure doesn't discard the report when it's most needed.
      await attachAccessibilityReport(collector)
    }

    await assertNoSeriousOrCriticalViolations(violations)
  })

  test('Should have no Serious/Critical accessibility violations across the accredited reprocessor report and PRN flow @accessibility', async ({
    page
  }) => {
    test.setTimeout(LIGHTHOUSE_TEST_TIMEOUT)
    const violations = []
    const collector = createAccessibilityCollector()
    const REG_NUMBER = 'R26ER5000000001PA'
    const ACC_NUMBER = 'A26ER5000000001PA'

    await tagAccessibilityTest('Accredited reprocessor report and PRN flow')

    try {
      await step(
        '🌐 Page tour: Accredited reprocessor report and PRN flow',
        async () => {
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
          const user = await createLinkAndLogin(
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
          const checkBeforeCreatingPRNPage = new CheckBeforeCreatingPRNPage(
            page
          )
          const prnCreatedPage = new PRNCreatedPage(page)
          const prnDashboardPage = new PRNDashboardPage(page)
          const prnViewPage = new PRNViewPage(page)
          const prnIssuedPage = new PRNIssuedPage(page)
          const confirmDeletePRNPage = new ConfirmDeletePRNPage(page)
          const confirmCancelPrnPage = new ConfirmCancelPRNPage(page)
          const prnCancelledPage = new PRNCancelledPage(page)

          // Submitted via epr-backend's dev endpoint rather than driving the
          // upload UI: this page tour is about the report/PRN flow, not the
          // upload itself - the earlier test in this file already scans the
          // upload/check/confirmation pages for violations.
          const summaryLogContent = await summaryLogContentFromFixture(
            `resources/sanity/reprocessorOutput_${ACC_NUMBER}_${REG_NUMBER}.xlsx`
          )
          await submitSummaryLogContent(
            organisationDetails.refNo,
            migrationResponse.registrationIds[0],
            defraIdStub.authHeader(user.userId),
            summaryLogContent
          )
          await navigateToReports(page)

          // --- Report wizard pages unique to the accredited reprocessor flow ---
          await reportsPage.selectActiveActionLink(1)
          await reportDetailPage.useThisData()
          violations.push(...(await scan(page, 'Tonnes recycled', collector)))

          await tonnesRecycledPage.enterTonnage('15.02')
          await tonnesRecycledPage.continue()
          violations.push(
            ...(await scan(page, 'Tonnes not recycled', collector))
          )

          await tonnesNotRecycledPage.enterTonnage('89.31')
          await tonnesNotRecycledPage.continue()
          violations.push(
            ...(await scan(page, 'Reprocessor PRN summary', collector))
          )

          await reprocessorPrnSummaryPage.enterRevenue('1576.12')
          await reprocessorPrnSummaryPage.continue()
          violations.push(...(await scan(page, 'Free PRNs', collector)))

          // Abandon the draft report here (report submission is already covered by
          // the exporter flow above) and move on to the PRN pages. Navigate back to
          // the dashboard explicitly first — we're still mid-wizard on Free PRNs,
          // which has no dashboard table to click through.
          await dashboardPage.open(organisationDetails.refNo)

          // --- Waste records page for an accredited registration (PRN links) ---
          await dashboardPage.selectTableLink(1, 1)
          violations.push(
            ...(await scan(
              page,
              'Waste records (accredited reprocessor)',
              collector
            ))
          )

          // --- Create, view and delete a draft (awaiting authorisation) PRN ---
          await wasteRecordsPage.createNewPRNLink().click()
          violations.push(...(await scan(page, 'Create PRN', collector)))

          await createPRNPage.createPrn(
            tonnageWordings.integer,
            tradingName,
            'Testing'
          )
          violations.push(
            ...(await scan(page, 'Check before creating PRN', collector))
          )

          await checkBeforeCreatingPRNPage.createPRNButton().click()
          violations.push(...(await scan(page, 'PRN created', collector)))

          await prnCreatedPage.returnToRegistrationPage().click()
          await dashboardPage.selectTableLink(1, 1)
          await wasteRecordsPage.managePRNsLink().click()
          violations.push(
            ...(await scan(
              page,
              'PRN dashboard (awaiting authorisation)',
              collector
            ))
          )

          await prnDashboardPage.selectAwaitingLink(1)
          violations.push(
            ...(await scan(
              page,
              'PRN view (awaiting authorisation)',
              collector
            ))
          )

          // Detour into the delete-PRN confirmation page and back.
          await prnViewPage.deletePRNButton().click()
          violations.push(
            ...(await scan(page, 'Confirm delete PRN', collector))
          )
          await confirmDeletePRNPage.backLink().click()

          // --- Issue the PRN, then have the recipient (RPD) reject it so the
          // cancellation confirmation pages can be scanned too ---
          await prnViewPage.issuePRNButton().click()
          violations.push(...(await scan(page, 'PRN issued', collector)))

          const prnNumber = await prnIssuedPage.prnNumberText()
          await externalAPICancelPrn({ prnNumber })

          await prnIssuedPage.managePRNs().click()
          violations.push(
            ...(await scan(
              page,
              'PRN dashboard (awaiting cancellation)',
              collector
            ))
          )

          await prnDashboardPage.selectAwaitingLink(1)
          violations.push(
            ...(await scan(page, 'PRN view (awaiting cancellation)', collector))
          )

          await prnViewPage.cancelPRNButton().click()
          violations.push(
            ...(await scan(page, 'Confirm cancel PRN', collector))
          )

          await confirmCancelPrnPage.confirmCancelPrn()
          violations.push(...(await scan(page, 'PRN cancelled', collector)))

          await prnCancelledPage.prnsPage().click()
          await homePage.signOutLink().click()
          await expect(page).toHaveTitle(/Signed out/)
        }
      )
    } finally {
      // Attach whatever was collected even if the tour above threw, so a
      // mid-tour failure doesn't discard the report when it's most needed.
      await attachAccessibilityReport(collector)
    }

    await assertNoSeriousOrCriticalViolations(violations)
  })
})
