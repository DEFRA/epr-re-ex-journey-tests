import { test, expect } from '@playwright/test'

import { AdminLoginPage } from 'page-objects/admin/login.page'
import { Navigation } from 'page-objects/admin/navigation.page'
import { SummaryLogUploadsPage } from 'page-objects/admin/summary.log.uploads.page'
import { seedAdminActivityData } from '../../support/admin-activity-seed.js'

test.describe('Summary log uploads report page', () => {
  let seeded

  test.beforeAll(async () => {
    seeded = await seedAdminActivityData()
  })

  test('Should list summary log upload activity for a registration and allow a CSV download @summarylogsuploadsreport', async ({
    page
  }) => {
    const loginPage = new AdminLoginPage(page)
    const navigation = new Navigation(page)
    const summaryLogUploadsPage = new SummaryLogUploadsPage(page)

    await loginPage.open()
    await expect(page).toHaveTitle(/Login/)
    await loginPage.enterCredentials('ea@test.gov.uk', 'pass')
    await loginPage.submitCredentials()

    await navigation.clickOnLink('Summary log uploads')

    const heading = await summaryLogUploadsPage.getHeaderText()
    expect(heading).toBe('Summary log uploads report')

    const totalRowsText = await summaryLogUploadsPage.totalRowsText()
    const totalRows = Number(totalRowsText.replace(/\D+/g, ''))
    expect(totalRows).toBeGreaterThan(0)

    const tableText = await summaryLogUploadsPage.tableText()
    expect(tableText).toContain(seeded.registrationNumber)
    expect(tableText).toContain(seeded.accreditationNumber)

    const csv = await summaryLogUploadsPage.fetchCsv()
    expect(csv.status).toEqual(200)
    expect(csv.contentType).toContain('text/csv')
    expect(csv.contentDisposition).toContain('attachment')
    expect(csv.contentDisposition).toContain('summary-log.csv')
    expect(csv.body).toContain('Summary log uploads report')
    expect(csv.body).toContain(seeded.registrationNumber)
    expect(csv.body).toContain(seeded.accreditationNumber)
  })
})
