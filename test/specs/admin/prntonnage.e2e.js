import { test, expect } from '@playwright/test'

import { AdminLoginPage } from 'page-objects/admin/login.page'
import { Navigation } from 'page-objects/admin/navigation.page'
import { PrnTonnagePage } from 'page-objects/admin/prn.tonnage.page'
import { seedAdminActivityData } from '../../support/seeding/admin-activity.js'
test.describe('PRN tonnage page', () => {
  let seeded

  test.beforeAll(async () => {
    seeded = await seedAdminActivityData()
  })

  test('Should report accepted PRN tonnage per accreditation and allow a CSV download @prntonnage', async ({
    page
  }) => {
    const loginPage = new AdminLoginPage(page)
    const navigation = new Navigation(page)
    const prnTonnagePage = new PrnTonnagePage(page)

    await loginPage.open()
    await expect(page).toHaveTitle(/Login/)
    await loginPage.enterCredentials('ea@test.gov.uk', 'pass')
    await loginPage.submitCredentials()

    await navigation.clickOnLink('PRN tonnage')

    const landingHeading = await prnTonnagePage.getHeaderText()
    expect(landingHeading).toBe('PRN tonnage')

    await prnTonnagePage.runReport()

    const tableText = await prnTonnagePage.tableText()
    expect(tableText).toContain(seeded.accreditationNumber)
    expect(tableText).toContain('Paper and board')
    // Every seeded PRN is accepted, so its tonnage should be attributed to
    // the "Accepted" column rather than any of the awaiting-* columns.
    expect(tableText).toContain(String(seeded.tonnage))

    const csv = await prnTonnagePage.fetchCsv()
    expect(csv.status).toEqual(200)
    expect(csv.contentType).toContain('text/csv')
    expect(csv.contentDisposition).toContain('attachment')
    expect(csv.body).toContain(seeded.accreditationNumber)
  })
})
