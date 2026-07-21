import { browser, expect } from '@wdio/globals'
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
import ConfirmDeleteReportPage from '../page-objects/confirm.delete.report.page.js'
import {
  createLinkedOrganisation,
  updateMigratedOrganisation
} from '../support/apicalls.js'
import { expectActionRequiredStatus } from '../support/report-status.js'
import { createLinkAndLogin } from '../support/login-helper.js'

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

describe('Deleting an in-progress report', () => {
  it('should delete from supporting information and check your answers pages @delreport', async () => {
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

    await createLinkAndLogin(organisationDetails.refNo, migrationResponse.email)

    // Upload summary log so report data exists
    await DashboardPage.selectTableLink(1, 1)
    await WasteRecordsPage.submitSummaryLogLink()

    const filePath = `resources/sanity/reprocessorOutput_${accNumber}_${regNumber}.xlsx`
    await UploadSummaryLogPage.performUploadAndReturnToHomepage(filePath)

    // --- Delete from supporting information page ---

    await DashboardPage.selectTableLink(1, 1)
    await WasteRecordsPage.manageReportsLink()

    // Create report — accredited reprocessor redirects to tonnes-recycled
    await ReportsPage.selectActiveActionLink(1)
    await ReportDetailPage.useThisDataAndCheckDoubleClickPrevented()

    // Navigate through reprocessor pages to reach supporting information
    await navigateReprocessorToSupportingInfo()

    // On supporting information page — click delete
    const supportingInfoHeading =
      await ReportSupportingInformationPage.headingText()
    expect(supportingInfoHeading).toBe(
      'Add supporting information for your regulator (optional)'
    )
    await ReportSupportingInformationPage.deleteReportLink()

    // Confirm deletion page — verify content
    let deleteHeading = await ConfirmDeleteReportPage.headingText()
    expect(deleteHeading).toBe('Confirm deletion of this report')

    const warningText = await ConfirmDeleteReportPage.warningText()
    expect(warningText).toContain('This action cannot be undone')

    // Test back link
    await ConfirmDeleteReportPage.selectBackLink()
    const backHeading = await ReportSupportingInformationPage.headingText()
    expect(backHeading).toBe(
      'Add supporting information for your regulator (optional)'
    )

    // Now delete
    await ReportSupportingInformationPage.deleteReportLink()
    await ConfirmDeleteReportPage.confirmDeletionAndCheckDoubleClickPrevented()

    // Should be back on reports list with status reverted to Due
    let reportsHeading = await ReportsPage.headingText()
    expect(reportsHeading).toContain('Reports')

    await expectActionRequiredStatus(1)

    // --- Delete from check your answers page ---

    // Create report again — accredited reprocessor redirects to tonnes-recycled
    await ReportsPage.selectActiveActionLink(1)
    await ReportDetailPage.useThisData()

    // Navigate through reprocessor pages to reach supporting information
    await navigateReprocessorToSupportingInfo()

    // Continue through supporting information
    await ReportSupportingInformationPage.continue()

    // On check your answers page — click delete and start again
    const checkHeading = await ReportCheckAnswersPage.headingText()
    expect(checkHeading).toBe(
      'Check your answers before you create this draft report'
    )
    await ReportCheckAnswersPage.deleteAndStartAgainLink()

    // Confirm deletion page — test back link returns to check your answers
    deleteHeading = await ConfirmDeleteReportPage.headingText()
    expect(deleteHeading).toBe('Confirm deletion of this report')

    await ConfirmDeleteReportPage.selectBackLink()
    const backToCheckAnswers = await ReportCheckAnswersPage.headingText()
    expect(backToCheckAnswers).toBe(
      'Check your answers before you create this draft report'
    )

    // Return to confirm deletion and delete
    await ReportCheckAnswersPage.deleteAndStartAgainLink()
    await ConfirmDeleteReportPage.confirmDeletion()

    // Should be back on reports list with status reverted to Due
    reportsHeading = await ReportsPage.headingText()
    expect(reportsHeading).toContain('Reports')

    await expectActionRequiredStatus(1)

    await HomePage.signOut()
    await expect(browser).toHaveTitle(expect.stringContaining('Signed out'))
  })
})
