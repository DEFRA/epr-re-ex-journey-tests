import { test, expect } from '@playwright/test'
import { createOrgWithAllWasteProcessingTypeAllMaterials } from '../support/apicalls.js'
import { DashboardPage } from 'page-objects/dashboard.page.js'
import { MATERIALS } from '../support/materials.js'
import { createLinkAndLogin } from '../support/login-helper.js'

test.describe('All materials and all waste processing types @allMaterials @smoketest', () => {
  test('Should be able to see all waste processing types and all materials on the User Interface', async ({
    page
  }) => {
    const dashboardPage = new DashboardPage(page)

    const { organisationDetails, userEmail } =
      await createOrgWithAllWasteProcessingTypeAllMaterials()
    await createLinkAndLogin(page, organisationDetails.refNo, userEmail)

    // Sanity check Reprocessor materials
    for (let i = 0; i < MATERIALS.length; i++) {
      let material = await dashboardPage.getMaterial(1, i + 1)
      expect(material).toBe(MATERIALS[i].name)

      material = await dashboardPage.getMaterial(2, i + 1)
      expect(material).toBe(MATERIALS[i].name)
    }

    await dashboardPage.selectExportingTab()

    // Sanity check Exporter materials
    for (let i = 0; i < MATERIALS.length; i++) {
      const material = await dashboardPage.getMaterial(1, i + 1)
      expect(material).toBe(MATERIALS[i].name)
    }
  })
})
