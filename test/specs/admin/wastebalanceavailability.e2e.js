import { test, expect } from '@playwright/test'

import { AdminLoginPage } from 'page-objects/admin/login.page'
import { Navigation } from 'page-objects/admin/navigation.page'
import { WasteBalanceAvailabilityPage } from 'page-objects/admin/waste.balance.availability.page'
import { checkAccessibility } from '../../support/accessibility.js'
import { currentYear } from '../../support/date.js'
import { availableWasteRecordYears } from '../../support/waste-record-years.js'

test.describe('Waste balance availability page', () => {
  test('An admin views and downloads waste balance availability for a chosen year @wasteBalanceAvailability', async ({
    page
  }) => {
    const loginPage = new AdminLoginPage(page)
    const navigation = new Navigation(page)
    const wasteBalanceAvailabilityPage = new WasteBalanceAvailabilityPage(page)

    await loginPage.open()
    await loginPage.enterCredentials('ea@test.gov.uk', 'pass')
    await loginPage.submitCredentials()
    await navigation.clickOnLink('Waste balance availability')

    const years = await availableWasteRecordYears()
    await expect(page).toHaveURL(
      new RegExp(`/waste-balance-availability\\?year=${currentYear()}$`)
    )
    expect(await wasteBalanceAvailabilityPage.availableYears()).toEqual(years)
    await expect(wasteBalanceAvailabilityPage.yearDropdown()).toHaveValue(
      String(currentYear())
    )
    await expect(wasteBalanceAvailabilityPage.balanceTable()).toBeVisible()
    await checkAccessibility(page, 'Waste balance availability')

    const chosenYear = years.find((year) => year !== String(currentYear()))
    if (!chosenYear) {
      throw new Error(`No year other than ${currentYear()} to show`)
    }
    await wasteBalanceAvailabilityPage.showYear(chosenYear)

    await expect(page).toHaveURL(
      new RegExp(`/waste-balance-availability\\?year=${chosenYear}$`)
    )
    await expect(wasteBalanceAvailabilityPage.yearDropdown()).toHaveValue(
      chosenYear
    )
    await expect(wasteBalanceAvailabilityPage.balanceTable()).toBeVisible()

    const csv = await wasteBalanceAvailabilityPage.download(
      wasteBalanceAvailabilityPage.downloadCsvButton()
    )
    expect(csv.failure).toBeNull()
    expect(csv.filename).toBe(`waste-balance-availability-${chosenYear}.csv`)
  })
})
