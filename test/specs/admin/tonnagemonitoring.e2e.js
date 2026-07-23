import { test, expect } from '@playwright/test'

import { AdminLoginPage } from 'page-objects/admin/login.page'
import { Navigation } from 'page-objects/admin/navigation.page'
import { TonnageMonitoringPage } from 'page-objects/admin/tonnage.monitoring.page'

test.describe('Tonnage Monitoring page', () => {
  test('Should be able to view Tonnage Monitoring if logged in @tonnagemonitoring', async ({
    page
  }) => {
    const loginPage = new AdminLoginPage(page)
    const navigation = new Navigation(page)
    const tonnageMonitoringPage = new TonnageMonitoringPage(page)

    await loginPage.open()
    await expect(page).toHaveTitle(/Login/)
    await loginPage.enterCredentials('ea@test.gov.uk', 'pass')
    await loginPage.submitCredentials()

    await navigation.clickOnLink('Tonnage monitoring')

    const tableData = await tonnageMonitoringPage.tonnageMaterialTableData()

    expect(tableData.length).toBeGreaterThan(0)
    const firstRow = tableData[0]
    expect(firstRow).toHaveProperty('Material')
    expect(firstRow).toHaveProperty('Type')
    expect(firstRow).toHaveProperty('Total')

    const monthColumns = Object.keys(firstRow).filter(
      (key) =>
        key !== 'Material' && key !== 'Type' && key !== 'Total' && key !== ''
    )
    expect(monthColumns.length).toBeGreaterThan(0)

    const materials = [
      'Aluminium',
      'Fibre based composite',
      'Paper and board',
      'Plastic',
      'Steel',
      'Wood',
      'Glass re-melt',
      'Glass other'
    ]
    const types = ['Reprocessor', 'Exporter']

    for (const material of materials) {
      for (const type of types) {
        const row = tableData.find(
          (r) => r.Material === material && r.Type === type
        )
        expect(row).toBeDefined()
        if (!row) {
          throw new Error('Row not found')
        }

        for (const month of monthColumns) {
          expect(row).toHaveProperty(month)
          const tonnageValue = row[month]
          expect(tonnageValue).toBeDefined()
        }

        expect(row).toHaveProperty('Total')
        expect(row.Total).toBeDefined()
      }
    }

    await tonnageMonitoringPage.downloadCsv()
  })
})
