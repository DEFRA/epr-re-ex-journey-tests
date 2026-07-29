import { test, expect } from '@playwright/test'

import { AdminLoginPage } from 'page-objects/admin/login.page'
import { Navigation } from 'page-objects/admin/navigation.page'
import { WasteBalanceAvailabilityPage } from 'page-objects/admin/waste.balance.availability.page'
import { seedAdminActivityData } from '../../support/admin-activity-seed.js'

test.describe('Waste balance availability page', () => {
  test.beforeAll(async () => {
    await seedAdminActivityData()
  })

  test('Should display the available waste balance by material and allow a CSV download @wastebalanceavailability', async ({
    page
  }) => {
    const loginPage = new AdminLoginPage(page)
    const navigation = new Navigation(page)
    const wasteBalanceAvailabilityPage = new WasteBalanceAvailabilityPage(page)

    await loginPage.open()
    await expect(page).toHaveTitle(/Login/)
    await loginPage.enterCredentials('ea@test.gov.uk', 'pass')
    await loginPage.submitCredentials()

    await navigation.clickOnLink('Waste balance availability')

    const heading = await wasteBalanceAvailabilityPage.getHeaderText()
    expect(heading).toBe('Waste balance availability')

    const tableData = await wasteBalanceAvailabilityPage.materialTableData()
    expect(tableData.length).toBeGreaterThan(0)

    // The seeded registration is Paper and board, so a row for it must exist
    // with a nonzero available amount attributable to the seed's upload.
    const paperRow = tableData.find((row) => row.Material === 'Paper and board')
    expect(paperRow).toBeDefined()
    expect(Number(paperRow['Available amount'])).toBeGreaterThan(0)

    const totalRow = tableData.find((row) => row.Material === 'Total')
    expect(totalRow).toBeDefined()

    const csv = await wasteBalanceAvailabilityPage.fetchCsv()
    expect(csv.status).toEqual(200)
    expect(csv.contentType).toContain('text/csv')
    expect(csv.contentDisposition).toContain('attachment')
    expect(csv.contentDisposition).toContain('waste-balance-availability.csv')
    expect(csv.body).toContain('Waste balance availability by material')
    expect(csv.body).toContain('Material,Available amount')
    expect(csv.body).toContain('Paper and board')
    expect(csv.body).toContain('Total')
  })
})
