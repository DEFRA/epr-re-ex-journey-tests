import DashboardPage from 'page-objects/dashboard.page.js'
import WasteRecordsPage from 'page-objects/waste.records.page.js'
import UploadSummaryLogPage from 'page-objects/upload.summary.log.page.js'

/**
 * Uploads the given summary log file from the org's registration page, then
 * navigates through to the Reports page.
 * @param {string} filePath
 */
export async function uploadSummaryLogAndNavigateToReports(filePath) {
  await DashboardPage.selectTableLink(1, 1)
  await WasteRecordsPage.submitSummaryLogLink()
  await UploadSummaryLogPage.performUploadAndReturnToHomepage(filePath)
  await DashboardPage.selectTableLink(1, 1)
  await WasteRecordsPage.manageReportsLink()
}
