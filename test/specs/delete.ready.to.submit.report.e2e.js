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
import { MonthlyReportDraftDeclarationPage } from '../page-objects/reports/monthly.report.draft.declaration.page.js'
import { ConfirmDeleteReportPage } from '../page-objects/confirm.delete.report.page.js'
import { checkBodyText } from '../support/checks.js'
import {
  createLinkedOrganisation,
  updateMigratedOrganisation,
  uploadAndSubmitSummaryLog
} from '../support/apicalls.js'
import { defraIdStub } from '../support/defra-id-stub.js'
import { expectActionRequiredStatus } from '../support/report-status.js'
import { createLinkAndLogin } from '../support/login-helper.js'

async function navigateReprocessorToSupportingInfo({
  tonnesRecycledPage,
  tonnesNotRecycledPage,
  reprocessorPrnSummaryPage,
  freePrnsPage
}) {
  await tonnesRecycledPage.enterTonnage('10')
  await tonnesRecycledPage.continue()
  await tonnesNotRecycledPage.enterTonnage('5')
  await tonnesNotRecycledPage.continue()
  await reprocessorPrnSummaryPage.enterRevenue('100')
  await reprocessorPrnSummaryPage.continue()
  await freePrnsPage.enterTonnage('0')
  await freePrnsPage.continue()
}

test.describe('Deleting a ready to submit report', () => {
  test('should delete from the submit page @delete-report', async ({
    page
  }) => {
    const homePage = new HomePage(page)
    const dashboardPage = new DashboardPage(page)
    const wasteRecordsPage = new WasteRecordsPage(page)
    const reportsPage = new ReportsPage(page)
    const reportDetailPage = new ReportDetailPage(page)
    const tonnesRecycledPage = new TonnesRecycledPage(page)
    const tonnesNotRecycledPage = new TonnesNotRecycledPage(page)
    const reprocessorPrnSummaryPage = new ReprocessorPrnSummaryPage(page)
    const freePrnsPage = new FreePrnsPage(page)
    const reportSupportingInformationPage = new ReportSupportingInformationPage(
      page
    )
    const reportCheckAnswersPage = new ReportCheckAnswersPage(page)
    const monthlyReportDraftDeclarationPage =
      new MonthlyReportDraftDeclarationPage(page)
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

    // Navigate to reports and create a draft report
    await dashboardPage.selectTableLink(1, 1)
    await wasteRecordsPage.manageReportsLink()
    await reportsPage.selectActiveActionLink(1)
    await reportDetailPage.useThisData()

    // Navigate through reprocessor data entry pages
    await navigateReprocessorToSupportingInfo({
      tonnesRecycledPage,
      tonnesNotRecycledPage,
      reprocessorPrnSummaryPage,
      freePrnsPage
    })
    await reportSupportingInformationPage.continue()

    // Create the draft report (transitions to ready_to_submit)
    await reportCheckAnswersPage.createReport()

    // Confirmation page — go back to reports list
    await checkBodyText(page, 'report created', 30)
    await page.locator('a', { hasText: 'Go to reports' }).click()

    // Report should now be ready to submit — click into it
    const statusBefore = await reportsPage.getActiveStatusBadge(1)
    const colourBefore = await reportsPage.getActiveStatusColour(1)

    expect(statusBefore).toBe('Ready to submit')
    expect(colourBefore).toBe('blue')

    await reportsPage.selectActiveActionLink(1)

    // On the submit/declaration page — click delete report
    await monthlyReportDraftDeclarationPage.deleteReport()

    // Verify confirm deletion page
    const deleteHeading = await confirmDeleteReportPage.headingText()
    expect(deleteHeading).toBe('Confirm deletion of this report')

    const warningText = await confirmDeleteReportPage.warningText()
    expect(warningText).toContain('This action cannot be undone')

    // Confirm deletion
    await confirmDeleteReportPage.confirmDeletion()

    // Should be back on reports list with status reverted to due
    const reportsHeading = await reportsPage.headingText()
    expect(reportsHeading).toContain('Reports')

    await expectActionRequiredStatus(page, 1)

    await homePage.signOut()
    await expect(page).toHaveTitle(/Signed out/)
  })
})
