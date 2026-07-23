import { test, expect } from '@playwright/test'

import { AdminLoginPage } from 'page-objects/admin/login.page'
import { Navigation } from 'page-objects/admin/navigation.page'
import { WasteRecordsExportPage } from 'page-objects/admin/waste.records.export.page'

test.describe('Waste records export page', () => {
  test('Should download a CSV with the expected metadata header columns @wasterecordsexport', async ({
    page
  }) => {
    const loginPage = new AdminLoginPage(page)
    const navigation = new Navigation(page)
    const wasteRecordsExportPage = new WasteRecordsExportPage(page)

    await loginPage.open()
    await expect(page).toHaveTitle(/Login/)
    await loginPage.enterCredentials('ea@test.gov.uk', 'pass')
    await loginPage.submitCredentials()

    await navigation.clickOnLink('Waste records export')

    const csv = await wasteRecordsExportPage.fetchCsv()
    expect(csv.status).toEqual(200)
    expect(csv.contentType).toContain('text/csv')
    expect(csv.contentDisposition).toContain('attachment')
    expect(csv.contentDisposition).toContain('waste-records-')

    const rows = csv.body
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
    expect(rows.length).toBeGreaterThanOrEqual(1)

    const headerRow = rows[0]
    const expectedMetadataHeaders = [
      'Regulator',
      'Organisation Name',
      'Registration Number',
      'Material',
      'Operator Processing Type',
      'Accredited',
      'Accreditation Number',
      'Waste Record Type',
      'Submitted At',
      'Included in Waste Balance',
      'Waste Balance Exclusion Reason',
      'Waste Balance Tonnage',
      'Row ID'
    ]

    for (const header of expectedMetadataHeaders) {
      expect(headerRow).toContain(header)
    }
  })
})
