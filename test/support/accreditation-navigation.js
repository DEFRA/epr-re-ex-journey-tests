import { DashboardPage } from 'page-objects/dashboard.page.js'
import { WasteRecordsPage } from 'page-objects/waste.records.page.js'

/**
 * Opens the organisation's first accreditation for the given year, from
 * anywhere in the service.
 * @param {import('@playwright/test').Page} page
 * @param {string} orgRefNo
 * @param {number} year
 */
export async function openAccreditationFor(page, orgRefNo, year) {
  const dashboardPage = new DashboardPage(page)
  await dashboardPage.open(orgRefNo)
  await dashboardPage.chooseYear(year)
  await dashboardPage.selectTableLink(1, 1)
  await new WasteRecordsPage(page).expectYear(year)
}
