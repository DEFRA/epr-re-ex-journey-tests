import { browser, expect } from '@wdio/globals'
import HomePage from 'page-objects/homepage.js'
import DashboardPage from '../page-objects/dashboard.page.js'
import WasteRecordsPage from '../page-objects/waste.records.page.js'
import {
  seedOverseasSites,
  createLinkedOrganisation,
  updateMigratedOrganisation
} from '../support/apicalls.js'
import ReportsPage from 'page-objects/reports/reports.page.js'
import { createLinkAndLogin } from '../support/login-helper.js'

describe('Report only shows from accreditation validFrom date — exporter @validFromReport', () => {
  const regNumber = 'E25SR500020912PA'
  const accNumber = 'E-ACC12245PA'

  let organisationDetails
  let migrationResponse

  it('displays active report as of this month only @validFromReport', async () => {
    organisationDetails = await createLinkedOrganisation([
      {
        material: 'Paper or board (R3)',
        wasteProcessingType: 'Exporter'
      }
    ])

    const now = new Date()
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const dateToday = lastMonth.toLocaleDateString('en-CA')

    migrationResponse = await updateMigratedOrganisation(
      organisationDetails.refNo,
      [{ regNumber, accNumber, status: 'approved' }],
      undefined,
      dateToday
    )

    await seedOverseasSites(organisationDetails.refNo)

    await createLinkAndLogin(organisationDetails.refNo, migrationResponse.email)

    await DashboardPage.selectTableLink(1, 1)
    await WasteRecordsPage.manageReportsLink()

    // wait for heading text for the page to load
    await ReportsPage.headingText()
    const activeReports = await ReportsPage.getActiveNumberOfRows()

    // Edge case when it's in January, no reports are expected
    if (now.getMonth() === 0) {
      expect(activeReports).toBe(0)
    } else {
      expect(activeReports).toBe(1)
      const monthYear = lastMonth.toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric'
      })
      expect(await ReportsPage.getActivePeriodLabel(1)).toBe(monthYear)
    }

    await HomePage.signOut()
    await expect(browser).toHaveTitle(expect.stringContaining('Signed out'))
  })
})
