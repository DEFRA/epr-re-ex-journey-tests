import { browser, expect } from '@wdio/globals'

import LoginPage from 'page-objects/admin/login.page'
import Navigation from 'page-objects/admin/navigation.page'
import TonnageMonitoringPage from 'page-objects/admin/tonnage.monitoring.page'

describe('Tonnage Monitoring page', () => {
  it('Should be able to view Tonnage Monitoring if logged in @tonnagemonitoring', async () => {
    await LoginPage.open()
    await expect(browser).toHaveTitle(expect.stringContaining('Login'))
    await LoginPage.enterCredentials('ea@test.gov.uk', 'pass')
    await LoginPage.submitCredentials()

    await Navigation.clickOnLink('Tonnage monitoring')

    const tableData = await TonnageMonitoringPage.tonnageMaterialTableData()

    await expect(tableData.length).toBeGreaterThan(0)
    const firstRow = tableData[0]
    await expect(firstRow).toHaveProperty('Material')
    await expect(firstRow).toHaveProperty('Type')
    await expect(firstRow).toHaveProperty('Total')

    const monthColumns = Object.keys(firstRow).filter(
      (key) =>
        key !== 'Material' && key !== 'Type' && key !== 'Total' && key !== ''
    )
    await expect(monthColumns.length).toBeGreaterThan(0)

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
        await expect(row).toBeDefined()
        if (!row) {
          throw new Error('Row not found')
        }

        for (const month of monthColumns) {
          await expect(row).toHaveProperty(month)
          const tonnageValue = row[month]
          await expect(tonnageValue).toBeDefined()
        }

        await expect(row).toHaveProperty('Total')
        await expect(row.Total).toBeDefined()
      }
    }

    await TonnageMonitoringPage.downloadCsv()
  })
})
