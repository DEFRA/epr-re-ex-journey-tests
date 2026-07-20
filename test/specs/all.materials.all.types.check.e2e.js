import { createOrgWithAllWasteProcessingTypeAllMaterials } from '../support/apicalls.js'
import DashboardPage from 'page-objects/dashboard.page.js'
import { expect } from '@wdio/globals'
import { MATERIALS } from '../support/materials.js'
import { createLinkAndLogin } from '../support/login-helper.js'

describe('All materials and all waste processing types @allMaterials @smoketest', () => {
  it('Should be able to see all waste processing types and all materials on the User Interface', async () => {
    const { organisationDetails, userEmail } =
      await createOrgWithAllWasteProcessingTypeAllMaterials()
    await createLinkAndLogin(organisationDetails.refNo, userEmail)

    // Sanity check Reprocessor materials
    for (let i = 0; i < MATERIALS.length; i++) {
      let material = await DashboardPage.getMaterial(1, i + 1)
      expect(material).toBe(MATERIALS[i].name)

      material = await DashboardPage.getMaterial(2, i + 1)
      expect(material).toBe(MATERIALS[i].name)
    }

    await DashboardPage.selectExportingTab()

    // Sanity check Exporter materials
    for (let i = 0; i < MATERIALS.length; i++) {
      const material = await DashboardPage.getMaterial(1, i + 1)
      expect(material).toBe(MATERIALS[i].name)
    }
  })
})
