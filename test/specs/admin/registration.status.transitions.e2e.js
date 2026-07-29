import { test, expect } from '@playwright/test'

import { AdminLoginPage } from 'page-objects/admin/login.page'
import { OrganisationsPage } from 'page-objects/admin/organisations.page'
import { OrganisationOverviewPage } from 'page-objects/admin/organisation.overview.page'
import { RegistrationOverviewPage } from 'page-objects/admin/registration.overview.page'
import { RegistrationTransitionPage } from 'page-objects/admin/registration.transition.page'
import {
  createLinkedOrganisation,
  updateMigratedOrganisation
} from '../../support/apicalls.js'

// Walks the registration grant journey through the admin UI transition
// action on the registration overview page: created -> approved (PAE-1599).
// Exporter waste-processing type is used so the fixture doesn't need a
// reprocessingType (forbidden for exporters, required for reprocessors), and
// withoutAccreditation keeps the fixture registration-only so this spec
// stays focused on the registration's own Status row.
test.describe('Admin registration status transitions', () => {
  test.describe.configure({ timeout: 3 * 60 * 1000 })

  test.beforeEach(async ({ page }) => {
    const loginPage = new AdminLoginPage(page)
    await loginPage.loginAsServiceMaintainer()
  })

  test('grants a registration through the admin UI @admin @registrationtransitions', async ({
    page
  }) => {
    const organisationsPage = new OrganisationsPage(page)
    const organisationOverviewPage = new OrganisationOverviewPage(page)
    const registrationOverviewPage = new RegistrationOverviewPage(page)
    const transitionPage = new RegistrationTransitionPage(page)

    const organisationDetails = await createLinkedOrganisation([
      {
        material: 'Aluminium (R4)',
        wasteProcessingType: 'Exporter',
        withoutAccreditation: true
      }
    ])
    const orgId = organisationDetails.refNo
    await updateMigratedOrganisation(orgId, [{ status: 'created' }])

    const companyName = organisationDetails.organisation.companyName

    await organisationsPage.open()
    await organisationsPage.searchFor(companyName)
    await organisationsPage.viewLink(1)
    await organisationOverviewPage.viewRegistrationLink(1)

    expect(await registrationOverviewPage.getRegistrationStatus()).toBe(
      'created'
    )

    // created -> approved: grant, issuing the registration number
    await registrationOverviewPage.clickRegistrationAction('Approve')
    expect(await transitionPage.getHeading()).toBe('Approve registration')
    await transitionPage.fillGrantFields({
      day: '1',
      month: '1',
      year: `${new Date().getFullYear()}`,
      registrationNumber: 'E25SR500030917PA'
    })
    await transitionPage.confirm('Approve now')

    expect(await registrationOverviewPage.getRegistrationStatus()).toBe(
      'approved'
    )

    // approved: the grant action is a one-way door - no Approve action
    // remains once the registration is approved
    await expect(
      registrationOverviewPage
        .registrationStatusRow()
        .getByRole('link', { name: /approve registration/i })
    ).toHaveCount(0)
  })
})
