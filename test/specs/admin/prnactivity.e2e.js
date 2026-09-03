import { test, expect } from '@playwright/test'

import { AdminLoginPage } from 'page-objects/admin/login.page'
import { Navigation } from 'page-objects/admin/navigation.page'
import { PrnActivityPage } from 'page-objects/admin/prn.activity.page'
import { seedAdminActivityData } from '../../support/seeding/admin-activity.js'
test.describe('PRN activity page', () => {
  let seeded

  test.beforeAll(async () => {
    seeded = await seedAdminActivityData()
  })

  test('Should list an accepted PRN and allow a CSV download @prnActivity', async ({
    page
  }) => {
    const loginPage = new AdminLoginPage(page)
    const navigation = new Navigation(page)
    const prnActivityPage = new PrnActivityPage(page)

    await loginPage.open()
    await expect(page).toHaveTitle(/Login/)
    await loginPage.enterCredentials('ea@test.gov.uk', 'pass')
    await loginPage.submitCredentials()

    await navigation.clickOnLink('PRN activity')

    const heading = await prnActivityPage.getHeaderText()
    expect(heading).toBe('PRN activity')

    const tableText = await prnActivityPage.tableText()
    expect(tableText).toContain(seeded.prnNumber)
    expect(tableText).toContain('accepted')
    expect(tableText).toContain(seeded.accreditationNumber)
    expect(tableText).toContain(String(seeded.tonnage))

    const csv = await prnActivityPage.fetchCsv()
    expect(csv.status).toEqual(200)
    expect(csv.contentType).toContain('text/csv')
    expect(csv.contentDisposition).toContain('attachment')
    expect(csv.contentDisposition).toContain('prn-activity.csv')
    expect(csv.body).toContain('PRN Number')
    expect(csv.body).toContain(seeded.prnNumber)
    expect(csv.body).toContain(seeded.accreditationNumber)
  })
})
