import { test, expect } from '@playwright/test'
import { HomePage } from 'page-objects/homepage.js'
import { DashboardPage } from '../page-objects/dashboard.page.js'
import { WasteRecordsPage } from '../page-objects/waste.records.page.js'
import { ReportsPage } from 'page-objects/reports/reports.page.js'
import { ReportDetailPage } from 'page-objects/reports/report.detail.page.js'
import { TonnesRecycledPage } from '../page-objects/reports/tonnes.recycled.page.js'
import { TonnesNotRecycledPage } from '../page-objects/reports/tonnes.not.recycled.page.js'
import { ReprocessorPrnSummaryPage } from '../page-objects/reports/reprocessor.prn.summary.page.js'
import { FreePrnsPage } from '../page-objects/reports/free.prns.page.js'
import { ReportSupportingInformationPage } from 'page-objects/reports/report.supporting.information.page.js'
import { ReportCheckAnswersPage } from 'page-objects/reports/report.check.answers.page.js'
import { ConfirmDeleteReportPage } from '../page-objects/confirm.delete.report.page.js'
import {
  createLinkedOrganisation,
  updateMigratedOrganisation,
  uploadAndSubmitSummaryLog
} from '../support/apicalls.js'
import { defraIdStub } from '../support/defra-id-stub.js'
import { expectActionRequiredStatus } from '../support/report-status.js'
import { createLinkAndLogin } from '../support/login-helper.js'

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

test.describe('Deleting an in-progress report', () => {
  test('should delete from supporting information and check your answers pages @delreport', async ({
    page
  }) => {
    const homePage = new HomePage(page)
    const dashboardPage = new DashboardPage(page)
    const wasteRecordsPage = new WasteRecordsPage(page)
    const reportsPage = new ReportsPage(page)
    const reportDetailPage = new ReportDetailPage(page)
    const reportSupportingInformationPage = new ReportSupportingInformationPage(
      page
    )
    const reportCheckAnswersPage = new ReportCheckAnswersPage(page)
    const confirmDeleteReportPage = new ConfirmDeleteReportPage(page)

    const regNumber = 'R25SR500010912PL'
    const accNumber = 'R-ACC12145PL'

    const organisationDetails = await createLinkedOrganisation([
      {
        material: 'Plastic (R3)',
        wasteProcessingType: 'Reprocessor'
      }
    ])

    const migrationResponse = await updateMigratedOrganisation(
      organisationDetails.refNo,
      [
        {
          reprocessingType: 'output',
          regNumber,
          accNumber,
          status: 'approved'
        }
      ]
    )

    const user = await createLinkAndLogin(
      page,
      organisationDetails.refNo,
      migrationResponse.email
    )

    // Upload summary log so report data exists
    const filePath = `resources/sanity/reprocessorOutput_${accNumber}_${regNumber}.xlsx`
    await uploadAndSubmitSummaryLog(
      organisationDetails.refNo,
      migrationResponse.registrationIds[0],
      defraIdStub.authHeader(user.userId),
      filePath
    )

    // --- Delete from supporting information page ---

    await dashboardPage.selectTableLink(1, 1)
    await wasteRecordsPage.manageReportsLink()

    // Create report — accredited reprocessor redirects to tonnes-recycled
    await reportsPage.selectActiveActionLink(1)
    await reportDetailPage.useThisDataAndCheckDoubleClickPrevented()

    // Navigate through reprocessor pages to reach supporting information
    await navigateReprocessorToSupportingInfo(page)

    // On supporting information page — click delete
    const supportingInfoHeading =
      await reportSupportingInformationPage.headingText()
    expect(supportingInfoHeading).toBe(
      'Add supporting information for your regulator (optional)'
    )
    await reportSupportingInformationPage.deleteReportLink()

    // Confirm deletion page — verify content
    let deleteHeading = await confirmDeleteReportPage.headingText()
    expect(deleteHeading).toBe('Confirm deletion of this report')

    const warningText = await confirmDeleteReportPage.warningText()
    expect(warningText).toContain('This action cannot be undone')

    // Test back link
    await confirmDeleteReportPage.selectBackLink()
    const backHeading = await reportSupportingInformationPage.headingText()
    expect(backHeading).toBe(
      'Add supporting information for your regulator (optional)'
    )

    // Now delete
    await reportSupportingInformationPage.deleteReportLink()
    await confirmDeleteReportPage.confirmDeletionAndCheckDoubleClickPrevented()

    // Should be back on reports list with status reverted to Due
    let reportsHeading = await reportsPage.headingText()
    expect(reportsHeading).toContain('Reports')

    await expectActionRequiredStatus(page, 1)

    // --- Delete from check your answers page ---

    // Create report again — accredited reprocessor redirects to tonnes-recycled
    await reportsPage.selectActiveActionLink(1)
    await reportDetailPage.useThisData()

    // Navigate through reprocessor pages to reach supporting information
    await navigateReprocessorToSupportingInfo(page)

    // Continue through supporting information
    await reportSupportingInformationPage.continue()

    // On check your answers page — click delete and start again
    const checkHeading = await reportCheckAnswersPage.headingText()
    expect(checkHeading).toBe(
      'Check your answers before you create this draft report'
    )
    await reportCheckAnswersPage.deleteAndStartAgainLink()

    // Confirm deletion page — test back link returns to check your answers
    deleteHeading = await confirmDeleteReportPage.headingText()
    expect(deleteHeading).toBe('Confirm deletion of this report')

    await confirmDeleteReportPage.selectBackLink()
    const backToCheckAnswers = await reportCheckAnswersPage.headingText()
    expect(backToCheckAnswers).toBe(
      'Check your answers before you create this draft report'
    )

    // Return to confirm deletion and delete
    await reportCheckAnswersPage.deleteAndStartAgainLink()
    await confirmDeleteReportPage.confirmDeletion()

    // Should be back on reports list with status reverted to Due
    reportsHeading = await reportsPage.headingText()
    expect(reportsHeading).toContain('Reports')

    await expectActionRequiredStatus(page, 1)

    await homePage.signOut()
    await expect(page).toHaveTitle(/Signed out/)
  })
})
