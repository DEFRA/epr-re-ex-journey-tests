import { test, expect } from '@playwright/test'

import { AdminLoginPage } from 'page-objects/admin/login.page'
import { OrganisationsPage } from 'page-objects/admin/organisations.page'
import { OrganisationOverviewPage } from 'page-objects/admin/organisation.overview.page'
import { RegistrationOverviewPage } from 'page-objects/admin/registration.overview.page'
import { RegistrationTransitionPage } from 'page-objects/admin/registration.transition.page'
import {
  createLinkedOrganisation,
  getOrganisation,
  updateMigratedOrganisation
} from '../../support/apicalls.js'

const CURRENT_YEAR = new Date().getFullYear()
// The dates typed into the approve confirm form (PAE-1814). The valid-to is
// deliberately not the value updateMigratedOrganisation seeds
// (SEEDED_VALID_TO), so asserting the granted value proves the grant wrote it.
const GRANTED_VALID_FROM = { day: '1', month: '1', year: `${CURRENT_YEAR}` }
const GRANTED_VALID_TO = { day: '31', month: '12', year: `${CURRENT_YEAR}` }
const GRANTED_VALID_FROM_ISO = `${CURRENT_YEAR}-01-01`
const GRANTED_VALID_TO_ISO = `${CURRENT_YEAR}-12-31`
const SEEDED_VALID_TO = `${CURRENT_YEAR + 1}-01-01`
// The reprocessing type chosen on the confirm page (PAE-1818). Nothing in the
// application or migration path populates it, so a reprocessor always reaches
// the grant without one.
const GRANTED_REPROCESSING_TYPE = 'input'

// Walks the full registration lifecycle through the admin UI transition
// actions on the registration overview page:
//   created -> rejected (reject) -> created (reopen) -> approved (grant)
//   -> cancelled (cancel) -> approved (reinstate after appeal)
// Covering every admin status-transition journey to date (PAE-1599,
// PAE-1609, PAE-1614, PAE-1615, PAE-1616), plus a second test covering the
// cascade cancellation of a linked live accreditation (PAE-1615). Those two
// use an Exporter waste-processing type so their fixtures don't need a
// reprocessingType (forbidden for exporters, required for reprocessors) —
// which also makes the first the place to prove an exporter is never offered
// the reprocessing-type control. The third test is the Reprocessor grant
// (PAE-1818), where that control is both offered and load-bearing.
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
    // and the validity window typed on the confirm page (PAE-1814)
    await registrationOverviewPage.clickRegistrationAction('Approve')
    expect(await transitionPage.getHeading()).toBe('Approve registration')

    // A reprocessing type is forbidden for an exporter, so the confirm page
    // offers no control for one (PAE-1818)
    await expect(transitionPage.reprocessingTypeRadios()).toHaveCount(0)

    await transitionPage.fillGrantFields({
      validFrom: GRANTED_VALID_FROM,
      validTo: GRANTED_VALID_TO,
      registrationNumber: 'E25SR500030917PA'
    })
    await transitionPage.confirm('Approve now')

    expect(await registrationOverviewPage.getRegistrationStatus()).toBe(
      'approved'
    )

    // The granted validity window is persisted exactly as entered, and the
    // valid-to has replaced the seeded one
    const grantedOrganisation = await getOrganisation(orgId)
    const grantedRegistration = grantedOrganisation.registrations[0]
    expect(grantedRegistration.validFrom).toBe(GRANTED_VALID_FROM_ISO)
    expect(grantedRegistration.validTo).toBe(GRANTED_VALID_TO_ISO)
    expect(grantedRegistration.validTo).not.toBe(SEEDED_VALID_TO)

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

  test('cancelling a registration cascades cancellation to its linked accreditation and gates its reinstatement @admin @registrationtransitions', async ({
    page
  }) => {
    const organisationsPage = new OrganisationsPage(page)
    const organisationOverviewPage = new OrganisationOverviewPage(page)
    const registrationOverviewPage = new RegistrationOverviewPage(page)
    const transitionPage = new RegistrationTransitionPage(page)

    // An approved registration with an approved linked accreditation, so the
    // cancel cascade (PAE-1615) has a live accreditation to force-cancel, and
    // reinstating the registration can be checked against the accreditation's
    // own Reinstate action gate (PAE-1800).
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

    // The cascade-cancelled accreditation cannot be reinstated on its own:
    // no Reinstate action while the registration is cancelled (PAE-1800)
    await expect(
      registrationOverviewPage
        .accreditationStatusRow()
        .getByRole('link', { name: /reinstate accreditation/i })
    ).toHaveCount(0)

    // cancelled -> approved: reinstating the registration reopens the gate
    await registrationOverviewPage.clickRegistrationAction('Reinstate')
    expect(await transitionPage.getHeading()).toBe('Reinstate registration')
    await transitionPage.confirm('Reinstate now')

    expect(await registrationOverviewPage.getRegistrationStatus()).toBe(
      'approved'
    )
    // No reverse cascade: the accreditation stays cancelled, but its
    // Reinstate action is offered again now the registration is approved
    expect(await registrationOverviewPage.getAccreditationStatus()).toBe(
      'cancelled'
    )
    await expect(
      registrationOverviewPage
        .accreditationStatusRow()
        .getByRole('link', { name: /reinstate accreditation/i })
    ).toHaveCount(1)
  })

  test('grants a reprocessor registration with a reprocessing type and cascades it to the linked accreditation @admin @registrationtransitions', async ({
    page
  }) => {
    const organisationsPage = new OrganisationsPage(page)
    const organisationOverviewPage = new OrganisationOverviewPage(page)
    const registrationOverviewPage = new RegistrationOverviewPage(page)
    const transitionPage = new RegistrationTransitionPage(page)

    // A reprocessor and its linked accreditation, both still created and
    // neither carrying a reprocessing type: the seed only writes one when it
    // is passed, and nothing in the application or migration path populates
    // it. That is the state every reprocessor reaches the grant in, and until
    // PAE-1818 there was no field to supply one — which made approving a
    // reprocessor through the admin UI impossible.
    const organisationDetails = await createLinkedOrganisation([
      { material: 'Aluminium (R4)', wasteProcessingType: 'Reprocessor' }
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

    await registrationOverviewPage.clickRegistrationAction('Approve')
    expect(await transitionPage.getHeading()).toBe('Approve registration')

    // Input or output, the two reprocessing types a reprocessor can have
    await expect(transitionPage.reprocessingTypeRadios()).toHaveCount(2)

    await transitionPage.fillGrantFields({
      validFrom: GRANTED_VALID_FROM,
      validTo: GRANTED_VALID_TO,
      registrationNumber: 'R25SR500030919AL',
      reprocessingType: GRANTED_REPROCESSING_TYPE
    })
    await transitionPage.confirm('Approve now')

    expect(await registrationOverviewPage.getRegistrationStatus()).toBe(
      'approved'
    )

    const grantedOrganisation = await getOrganisation(orgId)
    const grantedRegistration = grantedOrganisation.registrations[0]
    expect(grantedRegistration.status).toBe('approved')
    expect(grantedRegistration.reprocessingType).toBe(GRANTED_REPROCESSING_TYPE)
    expect(grantedRegistration.validFrom).toBe(GRANTED_VALID_FROM_ISO)
    expect(grantedRegistration.validTo).toBe(GRANTED_VALID_TO_ISO)

    // The cascade, end to end: the linked accreditation — still created —
    // receives the same reprocessing type in the same write. It is the
    // registration and its accreditation together that make up the identity
    // key, so writing one side alone would leave the pair unmatched and the
    // grant itself would be rejected.
    expect(grantedOrganisation.accreditations[0].reprocessingType).toBe(
      GRANTED_REPROCESSING_TYPE
    )
  })
})
