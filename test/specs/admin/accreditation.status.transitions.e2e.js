import { test, expect } from '@playwright/test'

import { AdminLoginPage } from 'page-objects/admin/login.page'
import { OrganisationsPage } from 'page-objects/admin/organisations.page'
import { OrganisationOverviewPage } from 'page-objects/admin/organisation.overview.page'
import { RegistrationOverviewPage } from 'page-objects/admin/registration.overview.page'
import { RegistrationTransitionPage } from 'page-objects/admin/registration.transition.page'
import { AccreditationTransitionPage } from 'page-objects/admin/accreditation.transition.page'
import {
  createLinkedOrganisation,
  getOrganisation,
  updateMigratedOrganisation
} from '../../support/seeding/organisation.js'
const CURRENT_YEAR = new Date().getFullYear()
// The dates typed into the approve confirm forms (PAE-1814). The valid-to is
// deliberately not the value updateMigratedOrganisation seeds
// (SEEDED_VALID_TO), so asserting the granted value proves the grant wrote it.
const GRANTED_VALID_FROM = { day: '1', month: '1', year: `${CURRENT_YEAR}` }
const GRANTED_VALID_TO = { day: '31', month: '12', year: `${CURRENT_YEAR}` }
const GRANTED_VALID_FROM_ISO = `${CURRENT_YEAR}-01-01`
const GRANTED_VALID_TO_ISO = `${CURRENT_YEAR}-12-31`
const SEEDED_VALID_TO = `${CURRENT_YEAR + 1}-01-01`

// Walks the full accreditation lifecycle through the admin UI transition
// actions on the registration overview page:
//   created -> rejected -> created (reopen) -> approved (grant) -> suspended -> approved (reapprove)
//   -> suspended -> cancelled (cancel) -> approved (reinstate after appeal)
// Covering every admin status-transition journey to date (PAE-1617, PAE-1618, PAE-1619,
// PAE-1621, PAE-1622, PAE-1623, PAE-1785). Direct approved -> cancelled is
// deliberately absent (suspend first, PAE-1624) — asserted by checking an
// approved accreditation offers no Cancel action. The accreditation also
// cannot be approved until its own registration is approved (PAE-1800) —
// asserted before granting the registration through the admin UI.
test.describe('Admin accreditation status transitions', () => {
  test.describe.configure({ timeout: 3 * 60 * 1000 })

  test.beforeEach(async ({ page }) => {
    const loginPage = new AdminLoginPage(page)
    await loginPage.loginAsServiceMaintainer()
  })

  test('gates approval on the registration, then rejects, reopens, grants, suspends, reapproves, cancels and reinstates an accreditation through the admin UI @accreditationTransitions', async ({
    page
  }) => {
    const organisationsPage = new OrganisationsPage(page)
    const organisationOverviewPage = new OrganisationOverviewPage(page)
    const registrationOverviewPage = new RegistrationOverviewPage(page)
    const registrationTransitionPage = new RegistrationTransitionPage(page)
    const transitionPage = new AccreditationTransitionPage(page)

    // A registration and its linked accreditation both still created, so the
    // journey starts by proving the approval gate (PAE-1800) before granting
    // the registration through the admin UI and continuing to the
    // accreditation grant step, which issues the accreditation number.
    const organisationDetails = await createLinkedOrganisation([
      { material: 'Aluminium (R4)', wasteProcessingType: 'Exporter' }
    ])
    const orgId = organisationDetails.refNo
    await updateMigratedOrganisation(orgId, [{ status: 'created' }])

    const companyName = organisationDetails.organisation.companyName

    await organisationsPage.open()
    await organisationsPage.searchFor(companyName)
    await organisationsPage.viewLink(1)
    await organisationOverviewPage.viewRegistrationLink(1)

    expect(await registrationOverviewPage.getAccreditationStatus()).toBe(
      'created'
    )
    expect(await registrationOverviewPage.getRegistrationStatus()).toBe(
      'created'
    )

    // No Approve accreditation action while the registration is not approved
    // (PAE-1800) — Reject is still offered
    await expect(
      registrationOverviewPage
        .accreditationStatusRow()
        .getByRole('link', { name: /approve accreditation/i })
    ).toHaveCount(0)
    await expect(
      registrationOverviewPage
        .accreditationStatusRow()
        .getByRole('link', { name: /reject accreditation/i })
    ).toHaveCount(1)

    // Granting the registration through the admin UI opens the gate
    await registrationOverviewPage.clickRegistrationAction('Approve')
    expect(await registrationTransitionPage.getHeading()).toBe(
      'Approve registration'
    )
    await registrationTransitionPage.fillGrantFields({
      validFrom: GRANTED_VALID_FROM,
      validTo: GRANTED_VALID_TO,
      registrationNumber: 'E25SR500030920PA'
    })
    await registrationTransitionPage.confirm('Approve now')

    expect(await registrationOverviewPage.getRegistrationStatus()).toBe(
      'approved'
    )

    // The registration's granted validity window is persisted exactly as
    // entered, and the valid-to has replaced the seeded one (PAE-1814)
    const grantedRegistration = (await getOrganisation(orgId)).registrations[0]
    expect(grantedRegistration.validFrom).toBe(GRANTED_VALID_FROM_ISO)
    expect(grantedRegistration.validTo).toBe(GRANTED_VALID_TO_ISO)
    expect(grantedRegistration.validTo).not.toBe(SEEDED_VALID_TO)

    await expect(
      registrationOverviewPage
        .accreditationStatusRow()
        .getByRole('link', { name: /approve accreditation/i })
    ).toHaveCount(1)

    // created -> rejected: refuse the application (PAE-1618)
    await registrationOverviewPage.clickAccreditationAction('Reject')
    expect(await transitionPage.getHeading()).toBe('Reject accreditation')
    await transitionPage.confirm('Reject now')

    expect(await registrationOverviewPage.getAccreditationStatus()).toBe(
      'rejected'
    )

    // rejected -> created: reopen for rework (PAE-1623)
    await registrationOverviewPage.clickAccreditationAction('Reopen')
    expect(await transitionPage.getHeading()).toBe('Reopen accreditation')
    await transitionPage.confirm('Reopen now')

    expect(await registrationOverviewPage.getAccreditationStatus()).toBe(
      'created'
    )

    // created -> approved: grant, issuing the accreditation number and the
    // validity window typed on the confirm page (PAE-1814)
    await registrationOverviewPage.clickAccreditationAction('Approve')
    expect(await transitionPage.getHeading()).toBe('Approve accreditation')
    await transitionPage.fillGrantFields({
      validFrom: GRANTED_VALID_FROM,
      validTo: GRANTED_VALID_TO,
      accreditationNumber: 'ACC234571'
    })
    await transitionPage.confirm('Approve now')

    expect(await registrationOverviewPage.getAccreditationStatus()).toBe(
      'approved'
    )

    // The accreditation's granted validity window is persisted exactly as
    // entered, and the valid-to has replaced the seeded one
    const grantedAccreditation = (await getOrganisation(orgId))
      .accreditations[0]
    expect(grantedAccreditation.validFrom).toBe(GRANTED_VALID_FROM_ISO)
    expect(grantedAccreditation.validTo).toBe(GRANTED_VALID_TO_ISO)
    expect(grantedAccreditation.validTo).not.toBe(SEEDED_VALID_TO)

    // An approved accreditation offers Suspend only — no direct cancel
    // (suspend first, PAE-1624)
    await expect(
      registrationOverviewPage
        .accreditationStatusRow()
        .getByRole('link', { name: /cancel accreditation/i })
    ).toHaveCount(0)

    // approved -> suspended
    await registrationOverviewPage.clickAccreditationAction('Suspend')
    expect(await transitionPage.getHeading()).toBe('Suspend accreditation')
    await transitionPage.confirm('Suspend now')

    expect(await registrationOverviewPage.getAccreditationStatus()).toBe(
      'suspended'
    )

    // suspended -> approved: reapprove lifts the suspension
    await registrationOverviewPage.clickAccreditationAction('Reapprove')
    expect(await transitionPage.getHeading()).toBe('Reapprove accreditation')
    await transitionPage.confirm('Reapprove now')

    expect(await registrationOverviewPage.getAccreditationStatus()).toBe(
      'approved'
    )

    // approved -> suspended -> cancelled: cancellation is terminal and only
    // reachable from suspended
    await registrationOverviewPage.clickAccreditationAction('Suspend')
    await transitionPage.confirm('Suspend now')

    await registrationOverviewPage.clickAccreditationAction('Cancel')
    expect(await transitionPage.getHeading()).toBe('Cancel accreditation')
    await transitionPage.confirm('Cancel accreditation now')

    expect(await registrationOverviewPage.getAccreditationStatus()).toBe(
      'cancelled'
    )

    // cancelled -> approved: reinstatement after a successful appeal,
    // effective on the day it is actioned
    await registrationOverviewPage.clickAccreditationAction('Reinstate')
    expect(await transitionPage.getHeading()).toBe('Reinstate accreditation')
    await transitionPage.confirm('Reinstate now')

    expect(await registrationOverviewPage.getAccreditationStatus()).toBe(
      'approved'
    )
  })
})
