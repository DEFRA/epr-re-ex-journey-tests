import {
  createLinkedOrganisation,
  getOrganisation,
  updateMigratedOrganisation,
  updateRegistrationStatus
} from '~/test/support/apicalls.js'
import { DashboardPage } from 'page-objects/dashboard.page.js'
import { test, expect } from '@playwright/test'
import { createLinkAndLogin } from '~/test/support/login-helper.js'

test.describe('Cancelled registration @cancelledregistration', () => {
  test('Cancelling a registration also cancels the linked accreditation @cancelledregistrationcascade', async ({
    page
  }) => {
    const dashboardPage = new DashboardPage(page)

    const regNumber = 'E25SR500030914PA'
    const accNumber = 'ACC234568'

    const organisationDetails = await createLinkedOrganisation([
      { material: 'Aluminium (R4)', wasteProcessingType: 'Exporter' }
    ])

    const orgId = organisationDetails.refNo
    const migrationResponse = await updateMigratedOrganisation(orgId, [
      {
        regNumber,
        accNumber,
        status: 'approved'
      }
    ])

    await createLinkAndLogin(page, orgId, migrationResponse.email)

    let regStatus = await dashboardPage.getRegistrationStatus(1, 1)
    expect(regStatus).toBe('Approved')

    let accStatus = await dashboardPage.getAccreditationStatus(1, 1)
    expect(accStatus).toBe('Approved')

    // Cancel the registration only — the backend force-cancels the linked
    // accreditation whether it is approved or suspended (PAE-1705 Scenario 5)
    await updateRegistrationStatus(orgId, 'cancelled')

    // The cascade is a backend behaviour: assert it at the API before the UI
    const orgData = await getOrganisation(orgId)
    expect(orgData.registrations[0].status).toBe('cancelled')
    expect(orgData.accreditations[0].status).toBe('cancelled')

    // The dashboard reflects both: cancelled registration tag, and the
    // cancelled accreditation no longer resolves as accredited
    await page.reload()

    regStatus = await dashboardPage.getRegistrationStatus(1, 1)
    expect(regStatus).toBe('Cancelled')

    accStatus = await dashboardPage.getAccreditationStatus(1, 1)
    expect(accStatus).toBe('Not accredited')
  })
})
