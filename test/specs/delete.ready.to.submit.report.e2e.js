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
import MonthlyReportDraftDeclarationPage from '../page-objects/reports/monthly.report.draft.declaration.page.js'
import ConfirmDeleteReportPage from '../page-objects/confirm.delete.report.page.js'
import { checkBodyText } from '../support/checks.js'
import {
  createAndRegisterDefraIdUser,
  createLinkedOrganisation,
  linkDefraIdUser,
  updateMigratedOrganisation
} from '../support/apicalls.js'
import { expectActionRequiredStatus } from '../support/report-status.js'

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

describe('Deleting a ready to submit report', () => {
  it('should delete from the submit page @delete-report', async () => {
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

    const user = await createAndRegisterDefraIdUser(migrationResponse.email)
    await linkDefraIdUser(
      organisationDetails.refNo,
      user.userId,
      migrationResponse.email
    )

    await HomePage.openStart()
    await HomePage.clickStartNow()
    await DefraIdStubPage.loginViaEmail(migrationResponse.email)

    // Upload summary log so report data exists
    await DashboardPage.selectTableLink(1, 1)
    await WasteRecordsPage.submitSummaryLogLink()

    const filePath = `resources/sanity/reprocessorOutput_${accNumber}_${regNumber}.xlsx`
    await UploadSummaryLogPage.performUploadAndReturnToHomepage(filePath)

    // Navigate to reports and create a draft report
    await DashboardPage.selectTableLink(1, 1)
    await WasteRecordsPage.manageReportsLink()
    await ReportsPage.selectActiveActionLink(1)
    await ReportDetailPage.useThisData()

    // Navigate through reprocessor data entry pages
    await navigateReprocessorToSupportingInfo()
    await ReportSupportingInformationPage.continue()

    // Create the draft report (transitions to ready_to_submit)
    await ReportCheckAnswersPage.createReport()

    // Confirmation page — go back to reports list
    await checkBodyText('report created', 30)
    await $('a*=Go to reports').click()

    // Report should now be ready to submit — click into it
    const statusBefore = await ReportsPage.getActiveStatusBadge(1)
    const colourBefore = await ReportsPage.getActiveStatusColour(1)

    expect(statusBefore).toBe('Ready to submit')
    expect(colourBefore).toBe('blue')

    await ReportsPage.selectActiveActionLink(1)

    // On the submit/declaration page — click delete report
    await MonthlyReportDraftDeclarationPage.deleteReport()

    // Verify confirm deletion page
    const deleteHeading = await ConfirmDeleteReportPage.headingText()
    expect(deleteHeading).toBe('Confirm deletion of this report')

    const warningText = await ConfirmDeleteReportPage.warningText()
    expect(warningText).toContain('This action cannot be undone')

    // Confirm deletion
    await ConfirmDeleteReportPage.confirmDeletion()

    // Should be back on reports list with status reverted to due
    const reportsHeading = await ReportsPage.headingText()
    expect(reportsHeading).toContain('Reports')

    await expectActionRequiredStatus(1)

    await HomePage.signOut()
    await expect(browser).toHaveTitle(expect.stringContaining('Signed out'))
  })
})
