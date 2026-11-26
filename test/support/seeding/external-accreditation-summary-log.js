import { DashboardPage } from 'page-objects/dashboard.page.js'
import { UploadSummaryLogPage } from 'page-objects/upload.summary.log.page.js'
import { WasteRecordsPage } from 'page-objects/waste.records.page.js'
import {
  EXTERNAL_ACCREDITATION_YEAR,
  seedExternalAccreditation,
  seedOrganisationAcrossYears
} from './organisation.js'
import { summaryLogDatedAt } from './summary-logs.js'
import { createLinkAndLogin } from '../login-helper.js'
import { checkOnUploadPage } from '../summary-log-checks.js'
import { generateSpreadsheetData } from '../spreadsheet/summarylogs-spreadsheet-data-generator.js'

export { EXTERNAL_ACCREDITATION_YEAR }

/** The material and operator type the submitted summary log reports. */
export const EXTERNAL_ACCREDITATION_MATERIAL = {
  material: 'Paper and board',
  type: 'Reprocessor'
}

/**
 * Seeds a reprocessor whose 2027 accreditation is held outside re-ex, and has
 * its operator submit a 2027 summary log of paper received against it, in a
 * page of its own.
 *
 * @param {import('@playwright/test').Browser} browser
 */
export async function submitSummaryLogForExternalAccreditation(browser) {
  const year = EXTERNAL_ACCREDITATION_YEAR
  const seeded = await seedOrganisationAcrossYears()
  const { accreditationNumber } = await seedExternalAccreditation(
    {
      organisationNumber: seeded.organisationNumber,
      registrationNumber: seeded.registrationNumber
    },
    year
  )
  const summaryLog = await summaryLogDatedAt(
    await generateSpreadsheetData({
      wasteProcessingType: 'reprocessorInput',
      materialSuffix: 'PA',
      regNumber: seeded.registrationNumber,
      accNumber: accreditationNumber,
      numberOfRows: 3,
      year,
      silentLogging: true
    }),
    new Date(Date.UTC(year, 0, 1, 12))
  )

  const page = await browser.newPage()
  try {
    const dashboardPage = new DashboardPage(page)
    const wasteRecordsPage = new WasteRecordsPage(page)

    await createLinkAndLogin(page, seeded.refNo, seeded.email)
    await dashboardPage.chooseYear(year)
    await dashboardPage.selectTableLink(1, 1)
    await wasteRecordsPage.expectYear(year)
    await wasteRecordsPage.submitSummaryLogLink().click()
    await checkOnUploadPage(page, year)
    await new UploadSummaryLogPage(page).performUploadAndReturnToHomepage(
      summaryLog,
      year
    )
  } finally {
    await page.close()
  }
}

/**
 * A figure as a report shows it, as a number.
 *
 * @param {string} text - e.g. "1,234.56"
 * @returns {number}
 */
export const reportedAmount = (text) =>
  Number.parseFloat(text.replace(/,/g, ''))
