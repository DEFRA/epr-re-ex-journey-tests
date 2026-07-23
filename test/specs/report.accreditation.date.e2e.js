import { test, expect } from '@playwright/test'
import { HomePage } from 'page-objects/homepage.js'
import { DashboardPage } from '../page-objects/dashboard.page.js'
import { WasteRecordsPage } from '../page-objects/waste.records.page.js'
import {
  seedOverseasSites,
  createLinkedOrganisation,
  updateMigratedOrganisation
} from '../support/apicalls.js'
import { ReportsPage } from 'page-objects/reports/reports.page.js'
import { createLinkAndLogin } from '../support/login-helper.js'

test.describe('Report only shows from accreditation validFrom date — exporter @validFromReport', () => {
  const regNumber = 'E25SR500020912PA'
  const accNumber = 'E-ACC12245PA'

  test('displays active report as of this month only @validFromReport', async ({
    page
  }) => {
    const homePage = new HomePage(page)
    const dashboardPage = new DashboardPage(page)
    const wasteRecordsPage = new WasteRecordsPage(page)
    const reportsPage = new ReportsPage(page)

    const organisationDetails = await createLinkedOrganisation([
      {
        material: 'Paper or board (R3)',
        wasteProcessingType: 'Exporter'
      }
    ])

    const now = new Date()
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const dateToday = lastMonth.toLocaleDateString('en-CA')

    const migrationResponse = await updateMigratedOrganisation(
      organisationDetails.refNo,
      [{ regNumber, accNumber, status: 'approved' }],
      undefined,
      dateToday
    )

    await seedOverseasSites(organisationDetails.refNo)

    await createLinkAndLogin(
      page,
      organisationDetails.refNo,
      migrationResponse.email
    )

    await dashboardPage.selectTableLink(1, 1)
    await wasteRecordsPage.manageReportsLink()

    // wait for heading text for the page to load
    await reportsPage.headingText()
    const activeReports = await reportsPage.getActiveNumberOfRows()

    // Edge case when it's in January, no reports are expected
    if (now.getMonth() === 0) {
      expect(activeReports).toBe(0)
    } else {
      expect(activeReports).toBe(1)
      const month = lastMonth.toLocaleDateString('en-US', { month: 'long' })
      const monthYear = `${month}, ${lastMonth.getFullYear()}`
      expect(await reportsPage.getActivePeriodLabel(1)).toBe(monthYear)
    }

    await homePage.signOut()
    await expect(page).toHaveTitle(/Signed out/)
  })
})
