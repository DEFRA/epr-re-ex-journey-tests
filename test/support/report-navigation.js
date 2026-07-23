import { DashboardPage } from 'page-objects/dashboard.page.js'
import { WasteRecordsPage } from 'page-objects/waste.records.page.js'
import { UploadSummaryLogPage } from 'page-objects/upload.summary.log.page.js'

/**
 * Uploads the given summary log file from the org's registration page, then
 * navigates through to the Reports page.
 * @param {import('@playwright/test').Page} page
 * @param {string} filePath
 */
export async function uploadSummaryLogAndNavigateToReports(page, filePath) {
  const dashboardPage = new DashboardPage(page)
  const wasteRecordsPage = new WasteRecordsPage(page)
  const uploadSummaryLogPage = new UploadSummaryLogPage(page)

  await dashboardPage.selectTableLink(1, 1)
  await wasteRecordsPage.submitSummaryLogLink()
  await uploadSummaryLogPage.performUploadAndReturnToHomepage(filePath)
  await dashboardPage.selectTableLink(1, 1)
  await wasteRecordsPage.manageReportsLink()
}
