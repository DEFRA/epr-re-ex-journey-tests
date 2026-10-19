import { test, expect } from '@playwright/test'
import { ChooseYearPage } from 'page-objects/choose.year.page.js'
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

  test('Choosing a different year shows the organisation as it was then', async ({
    page
  }) => {
    const dashboardPage = new DashboardPage(page)
    const chooseYearPage = new ChooseYearPage(page)
    const { refNo, email } = await seedOrganisationAcrossYears()
    const earlierYear = currentYear() - 1

    await createLinkAndLogin(page, refNo, email)
    await dashboardPage.chooseDifferentYearLink().click()

    await expect(chooseYearPage.yearOption(currentYear())).not.toBeChecked()

    await chooseYearPage.yearOption(earlierYear).check()
    await chooseYearPage.continueButton().click()

    await expect(page).toHaveURL(
      new RegExp(`/organisations/\\d+/${earlierYear}$`)
    )
    await expect(dashboardPage.yearHeading()).toHaveText(
      `This is ${earlierYear} data`
    )
    expect(await dashboardPage.getRegistrationStatus(1, 1)).toBe('Approved')
    expect(await dashboardPage.getAccreditationStatus(1, 1)).toBe(
      'Not accredited'
    )
  })
})
