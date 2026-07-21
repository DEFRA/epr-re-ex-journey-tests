import {
  createLinkedOrganisation,
  updateMigratedOrganisation,
  updateStatus
} from '~/test/support/apicalls.js'
import DashboardPage from 'page-objects/dashboard.page.js'
import { $, browser, expect } from '@wdio/globals'
import { checkBodyText } from '~/test/support/checks.js'
import { createLinkAndLogin } from '~/test/support/login-helper.js'

describe('Cancelled accreditation @cancelledaccreditation', () => {
  it('Should not be able to access PERNs when an accreditation is cancelled @cancelledprn', async () => {
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

    await createLinkAndLogin(orgId, migrationResponse.email)

    // We can still create PERN when accreditation is suspended and links should be available
    let accStatus = await DashboardPage.getAccreditationStatus(1, 1)
    expect(accStatus).toBe('Suspended')

    let regStatus = await DashboardPage.getRegistrationStatus(1, 1)
    expect(regStatus).toBe('Approved')

    await DashboardPage.selectTableLink(1, 1)

    expect(await $('a*=Create new PERN').isExisting()).toBe(true)
    expect(await $('a*=Manage PERNs').isExisting()).toBe(true)

    // now we cancel the accreditation, PERN links should be gone
    await updateStatus(orgId, 'cancelled')

    await DashboardPage.selectBackLink()

    accStatus = await DashboardPage.getAccreditationStatus(1, 1)
    expect(accStatus).toBe('Not accredited')

    regStatus = await DashboardPage.getRegistrationStatus(1, 1)
    expect(regStatus).toBe('Approved')

    await DashboardPage.selectTableLink(1, 1)

    expect(await $('a*=Create new PERN').isExisting()).toBe(false)
    expect(await $('a*=Manage PERNs').isExisting()).toBe(false)

    // Try to access pern directly -- should get a 404
    await browser.url(
      `/organisations/${orgId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes`
    )
    await checkBodyText('404', 10)
    await checkBodyText('Page not found', 10)
  })
})
