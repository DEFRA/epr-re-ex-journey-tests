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
import { ReportStaleErrorPage } from 'page-objects/reports/report.stale.error.page.js'
import { checkBodyText } from '../support/checks.js'
import {
  createLinkedOrganisation,
  updateMigratedOrganisation
} from '../support/apicalls.js'
import seedOverseasSites from '~/test/support/apicalls.js'
import { expectActionRequiredStatus } from '../support/report-status.js'
import { createLinkAndLogin } from '../support/login-helper.js'
import { uploadSummaryLogAndNavigateToReports } from '../support/report-navigation.js'

const PL_REG = 'R25SR500010912PL'
const PL_ACC = 'R-ACC12145PL'
const PL_FILE = `resources/sanity/reprocessorOutput_${PL_ACC}_${PL_REG}.xlsx`

const REG_ONLY_FILE = 'resources/exporter-regonly.xlsx'
const REG_NUMBER = 'E25SR500030913PA'

async function navigateReprocessorToSupportingInfo(page) {
  const tonnesRecycledPage = new TonnesRecycledPage(page)
  const tonnesNotRecycledPage = new TonnesNotRecycledPage(page)
  const reprocessorPrnSummaryPage = new ReprocessorPrnSummaryPage(page)
  const freePrnsPage = new FreePrnsPage(page)

  await tonnesRecycledPage.enterTonnage('10')
  await tonnesRecycledPage.continue()
  await tonnesNotRecycledPage.enterTonnage('5')
  await tonnesNotRecycledPage.continue()
  await reprocessorPrnSummaryPage.enterRevenue('100')
  await reprocessorPrnSummaryPage.continue()
  await freePrnsPage.enterTonnage('0')
  await freePrnsPage.continue()
}

async function setupAccreditedReprocessor(
  page,
  material,
  regNumber,
  accNumber
) {
  const orgDetails = await createLinkedOrganisation([
    { material, wasteProcessingType: 'Reprocessor' }
  ])

  const migrationResponse = await updateMigratedOrganisation(orgDetails.refNo, [
    {
      reprocessingType: 'output',
      regNumber,
      accNumber,
      status: 'approved'
    }
  ])

  await createLinkAndLogin(page, orgDetails.refNo, migrationResponse.email)
}

async function createDraftReportFromCurrentReportsPage(page) {
  const reportsPage = new ReportsPage(page)
  const reportDetailPage = new ReportDetailPage(page)
  const reportSupportingInformationPage = new ReportSupportingInformationPage(
    page
  )
  const reportCheckAnswersPage = new ReportCheckAnswersPage(page)

  await reportsPage.selectActiveActionLink(1)
  await reportDetailPage.useThisData()
  await navigateReprocessorToSupportingInfo(page)
  await reportSupportingInformationPage.continue()
  await reportCheckAnswersPage.createReport()
  await checkBodyText(page, 'report created', 30)
  await page.locator('a', { hasText: 'Go to reports' }).click()
}

async function setupAndCreateReport(
  page,
  material,
  regNumber,
  accNumber,
  filePath
) {
  await setupAccreditedReprocessor(page, material, regNumber, accNumber)

  await uploadSummaryLogAndNavigateToReports(page, filePath)
  await createDraftReportFromCurrentReportsPage(page)
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

test.describe('Stale report @staleReport', () => {
  test('should redirect to the stale SL error page when navigating to a stale report, with working Return and Delete buttons and unable to submit a stale ready-to-submit report @staleReportSubmit @staleReportNavigation', async ({
    page
  }) => {
    const homePage = new HomePage(page)
    const reportsPage = new ReportsPage(page)
    const reportStaleErrorPage = new ReportStaleErrorPage(page)

    await setupAndCreateReport(page, 'Plastic (R3)', PL_REG, PL_ACC, PL_FILE)

    // Re-upload SL to make the existing report stale
    await homePage.homeLink()
    await uploadSummaryLogAndNavigateToReports(page, PL_FILE)

    // Navigating to the report now triggers the stale error page
    // This means we are unable to submit a stale ready-to-submit report
    await reportsPage.selectActiveActionLink(1)

    expect(await reportStaleErrorPage.headingText()).toBe(
      'Your summary log has changed'
    )

    // "Return to reports" navigates back to the reports list without deleting
    await reportStaleErrorPage.returnToReports()
    expect(await reportsPage.headingText()).toContain('Reports')

    // Report is still present — navigating again shows the error page
    await reportsPage.selectActiveActionLink(1)
    expect(await reportStaleErrorPage.headingText()).toBe(
      'Your summary log has changed'
    )

    // "Delete and start again" deletes the report and returns to reports with
    // its un-started action-required status (Due, or Overdue if past due date)
    await reportStaleErrorPage.deleteAndStartAgain()
    expect(await reportsPage.headingText()).toContain('Reports')
    await expectActionRequiredStatus(page, 1)

    await homePage.signOut()
    await expect(page).toHaveTitle(/Signed out/)
  })

  test('should redirect to the stale SL error page when navigating to a stale report (Registered Only), and unable to submit a stale in-progress report @staleReportSubmit @staleReportInProgress', async ({
    page
  }) => {
    const homePage = new HomePage(page)
    const reportsPage = new ReportsPage(page)
    const reportDetailPage = new ReportDetailPage(page)
    const tonnesRecycledPage = new TonnesRecycledPage(page)
    const reportStaleErrorPage = new ReportStaleErrorPage(page)

    const setupResponse = await setupRegisteredOnlyExporter(page)

    await seedOverseasSites(
      setupResponse.organisationDetails.refNo,
      [0],
      [143, 297, 565, 893]
    )

    await uploadSummaryLogAndNavigateToReports(page, REG_ONLY_FILE)

    await reportsPage.selectActiveActionLink(1)
    await reportDetailPage.useThisData()
    await tonnesRecycledPage.saveAndComeBackLater()

    // Re-upload SL to make the existing report stale
    await homePage.homeLink()
    await uploadSummaryLogAndNavigateToReports(page, REG_ONLY_FILE)

    // Navigating to the report now triggers the stale error page
    // This means we are unable to submit a stale in-progress report
    await reportsPage.selectActiveActionLink(1)

    expect(await reportStaleErrorPage.headingText()).toBe(
      'Your summary log has changed'
    )

    // "Delete and start again" deletes the report and returns to reports with
    // its un-started action-required status (Due, or Overdue if past due date)
    await reportStaleErrorPage.deleteAndStartAgain()
    expect(await reportsPage.headingText()).toContain('Reports')
    await expectActionRequiredStatus(page, 1)

    await homePage.signOut()
    await expect(page).toHaveTitle(/Signed out/)
  })
})
