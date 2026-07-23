import {
  createLinkedOrganisation,
  updateMigratedOrganisation,
  updateStatus
} from '~/test/support/apicalls.js'
import { DashboardPage } from 'page-objects/dashboard.page.js'
import { test, expect } from '@playwright/test'
import { checkBodyText } from '~/test/support/checks.js'
import { createLinkAndLogin } from '~/test/support/login-helper.js'

test.describe('Cancelled accreditation @cancelledaccreditation', () => {
  test('Should not be able to access PERNs when an accreditation is cancelled @cancelledprn', async ({
    page
  }) => {
    const dashboardPage = new DashboardPage(page)

    const regNumber = 'E25SR500030913PA'
    const accNumber = 'ACC234567'

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

    const registrationId = migrationResponse.registrationIds[0]
    const accreditationId = migrationResponse.accreditationIds[0]

    await updateStatus(orgId, 'suspended')

    await createLinkAndLogin(page, orgId, migrationResponse.email)

    // We can still create PERN when accreditation is suspended and links should be available
    let accStatus = await dashboardPage.getAccreditationStatus(1, 1)
    expect(accStatus).toBe('Suspended')

    let regStatus = await dashboardPage.getRegistrationStatus(1, 1)
    expect(regStatus).toBe('Approved')

    await dashboardPage.selectTableLink(1, 1)

    expect(
      (await page.getByRole('link', { name: 'Create new PERN' }).count()) > 0
    ).toBe(true)
    expect(
      (await page.getByRole('link', { name: 'Manage PERNs' }).count()) > 0
    ).toBe(true)

    // now we cancel the accreditation, PERN links should be gone
    await updateStatus(orgId, 'cancelled')

    await dashboardPage.selectBackLink()

    accStatus = await dashboardPage.getAccreditationStatus(1, 1)
    expect(accStatus).toBe('Not accredited')

    regStatus = await dashboardPage.getRegistrationStatus(1, 1)
    expect(regStatus).toBe('Approved')

    await dashboardPage.selectTableLink(1, 1)

    expect(
      (await page.getByRole('link', { name: 'Create new PERN' }).count()) > 0
    ).toBe(false)
    expect(
      (await page.getByRole('link', { name: 'Manage PERNs' }).count()) > 0
    ).toBe(false)

    // Try to access pern directly -- should get a 404
    await page.goto(
      `/organisations/${orgId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes`
    )
    await checkBodyText(page, '404', 10)
    await checkBodyText(page, 'Page not found', 10)
  })
})
