import { browser, expect } from '@wdio/globals'

import LoginPage from 'page-objects/admin/login.page'
import Navigation from 'page-objects/admin/navigation.page'
import WasteRecordsExportPage from 'page-objects/admin/waste.records.export.page'

describe('Waste records export page', () => {
  it('Should download a CSV with the expected metadata header columns @wasterecordsexport', async () => {
    await LoginPage.open()
    await expect(browser).toHaveTitle(expect.stringContaining('Login'))
    await LoginPage.enterCredentials('ea@test.gov.uk', 'pass')
    await LoginPage.submitCredentials()

    await Navigation.clickOnLink('Waste records export')

    const csv = await WasteRecordsExportPage.fetchCsv()
    await expect(csv.status).toEqual(200)
    await expect(csv.contentType).toContain('text/csv')
    await expect(csv.contentDisposition).toContain('attachment')
    await expect(csv.contentDisposition).toContain('waste-records-')

    const rows = csv.body
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
    await expect(rows.length).toBeGreaterThanOrEqual(1)

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
      await expect(headerRow).toContain(header)
    }
  })
})
