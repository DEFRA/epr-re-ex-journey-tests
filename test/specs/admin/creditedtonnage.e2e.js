import { test, expect } from '@playwright/test'

import { AdminLoginPage } from 'page-objects/admin/login.page'
import { Navigation } from 'page-objects/admin/navigation.page'
import { CreditedTonnagePage } from 'page-objects/admin/credited.tonnage.page'
import { seedAdminActivityData } from '../../support/admin-activity-seed.js'

test.describe('Credited tonnage page', () => {
  let seeded

  test.beforeAll(async () => {
    seeded = await seedAdminActivityData()
  })

  test('Should report tonnage credited to the waste balance by accreditation and month, and allow a CSV download @creditedtonnage', async ({
    page
  }) => {
    const loginPage = new AdminLoginPage(page)
    const navigation = new Navigation(page)
    const creditedTonnagePage = new CreditedTonnagePage(page)

    await loginPage.open()
    await expect(page).toHaveTitle(/Login/)
    await loginPage.enterCredentials('ea@test.gov.uk', 'pass')
    await loginPage.submitCredentials()

    await navigation.clickOnLink('Credited tonnage')

    const heading = await creditedTonnagePage.getHeaderText()
    expect(heading).toBe('Tonnage credited to waste balances')

    const tableText = await creditedTonnagePage.tableText()
    expect(tableText).toContain(String(seeded.orgId))
    expect(tableText).toContain(seeded.accreditationNumber)
    expect(tableText).toContain('Paper and board')

    const csv = await creditedTonnagePage.fetchCsv()
    expect(csv.status).toEqual(200)
    expect(csv.contentType).toContain('text/csv')
    expect(csv.contentDisposition).toContain('attachment')
    expect(csv.contentDisposition).toContain('credited-tonnage-')
    expect(csv.body).toContain('total_credited')
    expect(csv.body).toContain(String(seeded.orgId))
    expect(csv.body).toContain(seeded.accreditationNumber)
  })
})
