import { test, expect } from '@playwright/test'

import { AdminLoginPage } from 'page-objects/admin/login.page'
import { Navigation } from 'page-objects/admin/navigation.page'
import { WasteRecordsExportPage } from 'page-objects/admin/waste.records.export.page'
import { seedAdminActivityData } from '../../support/seeding/admin-activity.js'
import { checkAccessibility } from '../../support/accessibility.js'

test.describe('Waste records export page', () => {
  let seeded

  test.beforeAll(async () => {
    seeded = await seedAdminActivityData()
  })

  test('Should download the waste records export as a CSV @wasteRecordsExport', async ({
    page
  }) => {
    const loginPage = new AdminLoginPage(page)
    const navigation = new Navigation(page)
    const wasteRecordsExportPage = new WasteRecordsExportPage(page)

    await loginPage.loginAsServiceMaintainer()

    await navigation.clickOnLink('Waste records export')
    await expect(page).toHaveTitle(/Waste records export/)
    await checkAccessibility(page, 'Waste records export')

    const csv = await wasteRecordsExportPage.fetchCsv()
    expect(csv.status).toEqual(200)
    expect(csv.contentType).toContain('text/csv')
    expect(csv.contentDisposition).toContain('attachment')
    expect(csv.contentDisposition).toContain('waste-records.csv')
    expect(csv.body).toContain(seeded.registrationNumber)
  })
})
