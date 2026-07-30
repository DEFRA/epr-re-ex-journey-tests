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

// Walks the full registration lifecycle through the admin UI transition
// actions on the registration overview page:
//   created -> rejected (reject) -> created (reopen) -> approved (grant)
//   -> cancelled (cancel) -> approved (reinstate after appeal)
// Covering every admin status-transition journey to date (PAE-1599,
// PAE-1609, PAE-1614, PAE-1615, PAE-1616), plus a second test covering the
// cascade cancellation of a linked live accreditation (PAE-1615). Exporter
// waste-processing type is used so the fixture doesn't need a
// reprocessingType (forbidden for exporters, required for reprocessors).
test.describe('Admin registration status transitions', () => {
  test.describe.configure({ timeout: 3 * 60 * 1000 })

  test.beforeEach(async ({ page }) => {
    const loginPage = new AdminLoginPage(page)
    await loginPage.loginAsServiceMaintainer()
  })

  test('rejects, reopens, grants, cancels and reinstates a registration through the admin UI @admin @registrationtransitions', async ({
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

    // created -> rejected: refuse the application (PAE-1609)
    await registrationOverviewPage.clickRegistrationAction('Reject')
    expect(await transitionPage.getHeading()).toBe('Reject registration')
    await transitionPage.confirm('Reject now')

    expect(await registrationOverviewPage.getRegistrationStatus()).toBe(
      'rejected'
    )

    // rejected -> created: reopen for rework (PAE-1614)
    await registrationOverviewPage.clickRegistrationAction('Reopen')
    expect(await transitionPage.getHeading()).toBe('Reopen registration')
    await transitionPage.confirm('Reopen now')

    expect(await registrationOverviewPage.getRegistrationStatus()).toBe(
      'created'
    )

    // created -> approved: grant, issuing the registration number (PAE-1599)
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

    // approved: grant is a one-way door — no Approve action remains
    await expect(
      registrationOverviewPage
        .registrationStatusRow()
        .getByRole('link', { name: /approve registration/i })
    ).toHaveCount(0)

    // approved -> cancelled: direct cancel, no suspended state (PAE-1615)
    await registrationOverviewPage.clickRegistrationAction('Cancel')
    expect(await transitionPage.getHeading()).toBe('Cancel registration')
    await transitionPage.confirm('Cancel registration now')

    expect(await registrationOverviewPage.getRegistrationStatus()).toBe(
      'cancelled'
    )

    // cancelled -> approved: reinstatement after a successful appeal (PAE-1616)
    await registrationOverviewPage.clickRegistrationAction('Reinstate')
    expect(await transitionPage.getHeading()).toBe('Reinstate registration')
    await transitionPage.confirm('Reinstate now')

    expect(await registrationOverviewPage.getRegistrationStatus()).toBe(
      'approved'
    )
  })

  test('cancelling a registration cascades cancellation to its linked accreditation @admin @registrationtransitions', async ({
    page
  }) => {
    const organisationsPage = new OrganisationsPage(page)
    const organisationOverviewPage = new OrganisationOverviewPage(page)
    const registrationOverviewPage = new RegistrationOverviewPage(page)
    const transitionPage = new RegistrationTransitionPage(page)

    // An approved registration with an approved linked accreditation, so the
    // cancel cascade (PAE-1615) has a live accreditation to force-cancel.
    const organisationDetails = await createLinkedOrganisation([
      { material: 'Aluminium (R4)', wasteProcessingType: 'Exporter' }
    ])
    const orgId = organisationDetails.refNo
    await updateMigratedOrganisation(orgId, [
      {
        regNumber: 'E25SR500030918PA',
        accNumber: 'ACC234572',
        status: 'approved'
      }
    ])

    const companyName = organisationDetails.organisation.companyName

    await organisationsPage.open()
    await organisationsPage.searchFor(companyName)
    await organisationsPage.viewLink(1)
    await organisationOverviewPage.viewRegistrationLink(1)

    expect(await registrationOverviewPage.getRegistrationStatus()).toBe(
      'approved'
    )
    expect(await registrationOverviewPage.getAccreditationStatus()).toBe(
      'approved'
    )

    await registrationOverviewPage.clickRegistrationAction('Cancel')
    expect(await transitionPage.getHeading()).toBe('Cancel registration')
    await transitionPage.confirm('Cancel registration now')

    expect(await registrationOverviewPage.getRegistrationStatus()).toBe(
      'cancelled'
    )
    // The cascade force-cancelled the linked accreditation in the same update
    expect(await registrationOverviewPage.getAccreditationStatus()).toBe(
      'cancelled'
    )
  })
})
