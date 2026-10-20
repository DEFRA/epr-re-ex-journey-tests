import { test, expect } from '@playwright/test'
import { HomePage } from 'page-objects/homepage.js'
import { ConfirmationPage } from 'page-objects/reports/confirmation.page.js'
import { MonthlyReportDraftDeclarationPage } from 'page-objects/reports/monthly.report.draft.declaration.page.js'
import { ReportCheckAnswersPage } from 'page-objects/reports/report.check.answers.page.js'
import { ReportDetailPage } from 'page-objects/reports/report.detail.page.js'
import { ReportSubmittedPage } from 'page-objects/reports/report.submitted.page.js'
import { ReportSupportingInformationPage } from 'page-objects/reports/report.supporting.information.page.js'
import { ReportsPage } from 'page-objects/reports/reports.page.js'
import { TonnesNotExportedPage } from '../page-objects/reports/tonnes.not.exported.page.js'
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
import { generateRegNumber } from '../support/reg-acc-number.js'
import { summaryLogContentNumbered } from '../support/spreadsheet/summarylogs-content-generator.js'
import {
  checkBodyText,
  checkBodyTextDoesNotInclude
} from '../support/checks.js'
import {
  closeCurrentTabAndReturn,
  switchToNewTab
} from '../support/windowtabs.js'
import { createLinkAndLogin } from '../support/login-helper.js'
import { defraIdStub } from '../support/defra-id-stub.js'
import { navigateToReports } from '../support/report-navigation.js'

// Submitted via epr-backend's dev endpoint rather than driving the upload
// UI: these journeys are about the reports wizard, not the upload itself,
// which the dedicated summary-log specs already cover.
/** @param {string} regNumber */
async function uploadAndNavigateToReports(
  page,
  organisationDetails,
  migrationResponse,
  user,
  regNumber
) {
  const summaryLogContent = await summaryLogContentNumbered(
    'resources/exporter-regonly.xlsx',
    { regNumber }
  )
  await submitSummaryLogContent(
    organisationDetails.refNo,
    migrationResponse.registrationIds[0],
    defraIdStub.authHeader(user.userId),
    summaryLogContent,
    registrationStartYear()
  )
  await navigateToReports(page)
}

async function setupRegisteredOnlyExporter(page) {
  const regNumber = generateRegNumber({
    wasteProcessingType: 'exporter',
    materialSuffix: 'PA'
  })

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
        regNumber,
        status: 'approved',
        withoutAccreditation: true
      }
    ]
  )

  const user = await createLinkAndLogin(
    page,
    organisationDetails.refNo,
    migrationResponse.email
  )

  return { organisationDetails, migrationResponse, user, regNumber }
}

test.describe('Registered-only exporter report flow @registeredOnlyExporter', () => {
  test.skip(
    reportsLandingHasNoClosedPeriod('quarterly'),
    'the reports landing has no closed quarter yet this year'
  )

  // These 3 tests share one continuous login session/report, the same
  // pattern used in accredited.reprocessor.report.e2e.js - serial mode + a
  // manually-created page shares setup instead of re-paying org creation,
  // login, and summary log upload 3 times. BackLinks cleans its report back
  // to "Due" so FullFlow (last, since it ends in a submitted/unsubmitted
  // state) starts fresh.
  //
  // CheckAnswersGuard and SubmitGuard (below, in their own smaller serial
  // group) share a second session instead of this one: SubmitGuard ends in a
  // genuinely submitted report with no UI path back to "Due", so it must run
  // last in a group of its own — it can't sit before FullFlow here.
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
      await uploadAndNavigateToReports(
        page,
        setupResponse.organisationDetails,
        setupResponse.migrationResponse,
        setupResponse.user,
        setupResponse.regNumber
      )
    })

    test.afterAll(async () => {
      const homePage = new HomePage(page)
      await homePage.signOutLink().click()
      await expect(page).toHaveTitle(/Signed out/)
      await page.close()
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
      await expect(
        page.getByRole('link', {
          name: 'Change Total tonnage received but not exported'
        })
      ).toBeVisible()

      // Verify NO PERN section present
      await checkBodyTextDoesNotInclude(page, 'PERN revenue', 5)
      await checkBodyTextDoesNotInclude(page, 'Free PERNs', 5)

      // Submit the report
      await reportCheckAnswersPage.createReport()

      // Verify confirmation page
      await checkBodyText(page, 'report created', 30)

      // --- View draft report in new tab ---
      await confirmationPage.viewDraftReport().click()
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

      await confirmationPage.goToReports().click()
      await reportsPage.selectActiveActionLink(1)

      // Confirm and submit report
      await monthlyReportDraftDeclarationPage.confirmAndSubmit()

      const confirmationText = await reportSubmittedPage.confirmationText()
      expect(confirmationText).toContain('report submitted to regulator')

      await reportSubmittedPage.viewReportLink().click()
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

      await reportSubmittedPage.returnToReportsLink().click()
      const submittedBadge = await reportsPage.getSubmittedStatusBadge(1)
      const submittedColour = await reportsPage.getSubmittedStatusColour(1)

      expect(submittedBadge).toBe('Submitted')
      expect(submittedColour).toBe('green')

      // Now we unsubmit the report via epr-backend to see the effects on the frontend
      await unsubmitReport(
        setupResponse.organisationDetails.refNo,
        setupResponse.migrationResponse.registrationIds[0],
        registrationStartYear(),
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

  // CheckAnswersGuard and SubmitGuard share one org/login/upload session too.
  // CheckAnswersGuard leaves its report "Ready to submit" after the guard
  // redirect, then explicitly deletes it via the submit page (a proven-safe
  // path back to "Due" — see delete.report.e2e.js) so SubmitGuard starts its
  // own fresh report via ordinary forward navigation, exactly as it would
  // with independent setup. SubmitGuard genuinely submits its report with no
  // way back to "Due", so it runs last and this group stays separate from
  // the "with upload" group above.
})
