import { $, browser, expect } from '@wdio/globals'
import DefraIdStubPage from 'page-objects/defra.id.stub.page.js'
import HomePage from 'page-objects/homepage.js'
import DashboardPage from '../page-objects/dashboard.page.js'
import WasteRecordsPage from '../page-objects/waste.records.page.js'
import UploadSummaryLogPage from 'page-objects/upload.summary.log.page.js'
import ReportsPage from 'page-objects/reports/reports.page.js'
import ReportDetailPage from 'page-objects/reports/report.detail.page.js'
import TonnesRecycledPage from '../page-objects/reports/tonnes.recycled.page.js'
import TonnesNotRecycledPage from '../page-objects/reports/tonnes.not.recycled.page.js'
import ReprocessorPrnSummaryPage from '../page-objects/reports/reprocessor.prn.summary.page.js'
import FreePrnsPage from '../page-objects/reports/free.prns.page.js'
import ReportSupportingInformationPage from 'page-objects/reports/report.supporting.information.page.js'
import ReportCheckAnswersPage from 'page-objects/reports/report.check.answers.page.js'
import ReportStaleErrorPage from 'page-objects/reports/report.stale.error.page.js'
import { checkBodyText } from '../support/checks.js'
import {
  createAndRegisterDefraIdUser,
  createLinkedOrganisation,
  linkDefraIdUser,
  updateMigratedOrganisation
} from '../support/apicalls.js'
import seedOverseasSites from '~/test/support/apicalls.js'
import { expectActionRequiredStatus } from '../support/report-status.js'

const PL_REG = 'R25SR500010912PL'
const PL_ACC = 'R-ACC12145PL'
const PL_FILE = `resources/sanity/reprocessorOutput_${PL_ACC}_${PL_REG}.xlsx`

const REG_ONLY_FILE = 'resources/exporter-regonly.xlsx'
const REG_NUMBER = 'E25SR500030913PA'

async function navigateReprocessorToSupportingInfo() {
  await TonnesRecycledPage.enterTonnage('10')
  await TonnesRecycledPage.continue()
  await TonnesNotRecycledPage.enterTonnage('5')
  await TonnesNotRecycledPage.continue()
  await ReprocessorPrnSummaryPage.enterRevenue('100')
  await ReprocessorPrnSummaryPage.continue()
  await FreePrnsPage.enterTonnage('0')
  await FreePrnsPage.continue()
}

async function setupAccreditedReprocessor(material, regNumber, accNumber) {
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

  const user = await createAndRegisterDefraIdUser(migrationResponse.email)
  await linkDefraIdUser(orgDetails.refNo, user.userId, migrationResponse.email)

  await HomePage.openStart()
  await HomePage.clickStartNow()
  await DefraIdStubPage.loginViaEmail(migrationResponse.email)
}

async function createDraftReportFromCurrentReportsPage() {
  await ReportsPage.selectActiveActionLink(1)
  await ReportDetailPage.useThisData()
  await navigateReprocessorToSupportingInfo()
  await ReportSupportingInformationPage.continue()
  await ReportCheckAnswersPage.createReport()
  await checkBodyText('report created', 30)
  await $('a*=Go to reports').click()
}

async function setupAndCreateReport(material, regNumber, accNumber, filePath) {
  await setupAccreditedReprocessor(material, regNumber, accNumber)

  await DashboardPage.selectTableLink(1, 1)
  await WasteRecordsPage.submitSummaryLogLink()
  await UploadSummaryLogPage.performUploadAndReturnToHomepage(filePath)

  await DashboardPage.selectTableLink(1, 1)
  await WasteRecordsPage.manageReportsLink()
  await createDraftReportFromCurrentReportsPage()
}

async function uploadAndNavigateToReports() {
  await DashboardPage.selectTableLink(1, 1)
  await WasteRecordsPage.submitSummaryLogLink()
  await UploadSummaryLogPage.performUploadAndReturnToHomepage(REG_ONLY_FILE)
  await DashboardPage.selectTableLink(1, 1)
  await WasteRecordsPage.manageReportsLink()
}

async function setupRegisteredOnlyExporter() {
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

  const user = await createAndRegisterDefraIdUser(migrationResponse.email)
  await linkDefraIdUser(
    organisationDetails.refNo,
    user.userId,
    migrationResponse.email
  )

  await HomePage.openStart()
  await HomePage.clickStartNow()
  await DefraIdStubPage.loginViaEmail(migrationResponse.email)

  return { organisationDetails, migrationResponse }
}

describe('Stale report @staleReport', () => {
  it('should redirect to the stale SL error page when navigating to a stale report, with working Return and Delete buttons and unable to submit a stale ready-to-submit report @staleReportSubmit @staleReportNavigation', async () => {
    await setupAndCreateReport('Plastic (R3)', PL_REG, PL_ACC, PL_FILE)

    // Re-upload SL to make the existing report stale
    await HomePage.homeLink()
    await DashboardPage.selectTableLink(1, 1)
    await WasteRecordsPage.submitSummaryLogLink()
    await UploadSummaryLogPage.performUploadAndReturnToHomepage(PL_FILE)

    // Navigating to the report now triggers the stale error page
    // This means we are unable to submit a stale ready-to-submit report
    await DashboardPage.selectTableLink(1, 1)
    await WasteRecordsPage.manageReportsLink()
    await ReportsPage.selectActiveActionLink(1)

    expect(await ReportStaleErrorPage.headingText()).toBe(
      'Your summary log has changed'
    )

    // "Return to reports" navigates back to the reports list without deleting
    await ReportStaleErrorPage.returnToReports()
    expect(await ReportsPage.headingText()).toContain('Reports')

    // Report is still present — navigating again shows the error page
    await ReportsPage.selectActiveActionLink(1)
    expect(await ReportStaleErrorPage.headingText()).toBe(
      'Your summary log has changed'
    )

    // "Delete and start again" deletes the report and returns to reports with
    // its un-started action-required status (Due, or Overdue if past due date)
    await ReportStaleErrorPage.deleteAndStartAgain()
    expect(await ReportsPage.headingText()).toContain('Reports')
    await expectActionRequiredStatus(1)

    await HomePage.signOut()
    await expect(browser).toHaveTitle(expect.stringContaining('Signed out'))
  })

  it('should redirect to the stale SL error page when navigating to a stale report (Registered Only), and unable to submit a stale in-progress report @staleReportSubmit @staleReportInProgress', async () => {
    const setupResponse = await setupRegisteredOnlyExporter()

    await seedOverseasSites(
      setupResponse.organisationDetails.refNo,
      [0],
      [143, 297, 565, 893]
    )

    await uploadAndNavigateToReports()

    await ReportsPage.selectActiveActionLink(1)
    await ReportDetailPage.useThisData()
    await TonnesRecycledPage.saveAndComeBackLater()

    // Re-upload SL to make the existing report stale
    await HomePage.homeLink()
    await DashboardPage.selectTableLink(1, 1)
    await WasteRecordsPage.submitSummaryLogLink()
    await UploadSummaryLogPage.performUploadAndReturnToHomepage(REG_ONLY_FILE)

    // Navigating to the report now triggers the stale error page
    // This means we are unable to submit a stale in-progress report
    await DashboardPage.selectTableLink(1, 1)
    await WasteRecordsPage.manageReportsLink()
    await ReportsPage.selectActiveActionLink(1)

    expect(await ReportStaleErrorPage.headingText()).toBe(
      'Your summary log has changed'
    )

    // "Delete and start again" deletes the report and returns to reports with
    // its un-started action-required status (Due, or Overdue if past due date)
    await ReportStaleErrorPage.deleteAndStartAgain()
    expect(await ReportsPage.headingText()).toContain('Reports')
    await expectActionRequiredStatus(1)

    await HomePage.signOut()
    await expect(browser).toHaveTitle(expect.stringContaining('Signed out'))
  })
})
