import { test, expect } from '@playwright/test'
import { DashboardPage } from 'page-objects/dashboard.page.js'
import { seedOrganisationAcrossYears } from '~/test/support/seeding/organisation.js'
import { createLinkAndLogin } from '~/test/support/login-helper.js'
import { currentYear } from '~/test/support/date.js'

test.describe('Navigate across years @navigateAcrossYears', () => {
  test('Organisation home page defaults to the latest year with an active registration', async ({
    page
  }) => {
    const dashboardPage = new DashboardPage(page)
    const { refNo, email } = await seedOrganisationAcrossYears()

    await createLinkAndLogin(page, refNo, email)

    await expect(dashboardPage.yearHeading()).toHaveText(
      `This is ${currentYear()} data`
    )
    expect(await dashboardPage.getRegistrationStatus(1, 1)).toBe('Approved')
    expect(await dashboardPage.getAccreditationStatus(1, 1)).toBe('Approved')
  })
})
