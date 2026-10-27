import { test, expect } from '@playwright/test'

import { AdminLoginPage } from 'page-objects/admin/login.page'
import { OrganisationsPage } from 'page-objects/admin/organisations.page'
import { OrganisationOverviewPage } from 'page-objects/admin/organisation.overview.page'
import { RegistrationOverviewPage } from 'page-objects/admin/registration.overview.page'
import { ReportViewPage } from 'page-objects/admin/report.view.page'
import { seedPreviousYearReport } from '../../support/seeding/reports.js'
import { currentYear } from '../../support/date.js'

test.describe('Registration overview - report years', () => {
  test.beforeEach(async ({ page }) => {
    const loginPage = new AdminLoginPage(page)
    await loginPage.loginAsServiceMaintainer()
  })

  test("shows the latest year's reports and links to an earlier year's @organisations", async ({
    page
  }) => {
    const organisationsPage = new OrganisationsPage(page)
    const organisationOverviewPage = new OrganisationOverviewPage(page)
    const registrationOverviewPage = new RegistrationOverviewPage(page)
    const reportViewPage = new ReportViewPage(page)

    const { companyName, previousYear } = await seedPreviousYearReport()

    await organisationsPage.open()
    await organisationsPage.searchFor(companyName)
    await organisationsPage.viewLink(1)
    await organisationOverviewPage.viewRegistrationLink(1)

    await expect(registrationOverviewPage.reportsCaption()).toHaveText(
      `Reports ${currentYear()}`
    )

    await registrationOverviewPage.clickOnReportYearLink(previousYear)

    await expect(page).toHaveURL(new RegExp(`\\?year=${previousYear}#reports$`))
    await expect(registrationOverviewPage.reportsCaption()).toHaveText(
      `Reports ${previousYear}`
    )

    const reportsData = await registrationOverviewPage.getReportsTableData()
    const rowNumber =
      reportsData.findIndex(
        (row) => row.period === 'Quarter 4' && row.submission === '1'
      ) + 1
    expect(rowNumber).toBeGreaterThan(0)
    expect(reportsData[rowNumber - 1].status).toEqual('Submitted')

    await registrationOverviewPage.clickOnViewReportLink(rowNumber)
    expect(await reportViewPage.getHeaderText()).toEqual(
      `Report – ${previousYear} quarterly period 4 submission 1`
    )
  })
})
