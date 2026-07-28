import { test, expect } from '@playwright/test'

import { AdminLoginPage } from 'page-objects/admin/login.page'
import { OrganisationsPage } from 'page-objects/admin/organisations.page'
import { OrganisationOverviewPage } from 'page-objects/admin/organisation.overview.page'
import { RegistrationOverviewPage } from 'page-objects/admin/registration.overview.page'
import { AccreditationTransitionPage } from 'page-objects/admin/accreditation.transition.page'
import {
  createLinkedOrganisation,
  updateMigratedOrganisation
} from '../../support/apicalls.js'

// Walks the full accreditation lifecycle through the admin UI transition
// actions on the registration overview page:
//   created -> rejected (reject) -> created (reopen) -> approved (grant)
//   -> suspended -> approved (reapprove) -> suspended -> cancelled (cancel)
//   -> approved (reinstate after appeal)
// Covering every admin status-transition journey to date (PAE-1617,
// PAE-1618, PAE-1619, PAE-1621, PAE-1622, PAE-1623, PAE-1785). Direct
// approved -> cancelled is deliberately absent (suspend first, PAE-1624) —
// asserted by checking an approved accreditation offers no Cancel action.
test.describe('Admin accreditation status transitions', () => {
  test.describe.configure({ timeout: 3 * 60 * 1000 })

  test.beforeEach(async ({ page }) => {
    const loginPage = new AdminLoginPage(page)
    await loginPage.loginAsServiceMaintainer()
  })

  test('rejects, reopens, grants, suspends, reapproves, cancels and reinstates an accreditation through the admin UI @admin @accreditationtransitions', async ({
    page
  }) => {
    const organisationsPage = new OrganisationsPage(page)
    const organisationOverviewPage = new OrganisationOverviewPage(page)
    const registrationOverviewPage = new RegistrationOverviewPage(page)
    const transitionPage = new AccreditationTransitionPage(page)

    // An approved registration whose linked accreditation is still created,
    // so the journey starts at the grant step. The grant issues the number.
    const regNumber = 'E25SR500030916PA'
    const organisationDetails = await createLinkedOrganisation([
      { material: 'Aluminium (R4)', wasteProcessingType: 'Exporter' }
    ])
    const orgId = organisationDetails.refNo
    await updateMigratedOrganisation(orgId, [
      {
        regNumber,
        status: 'approved',
        accStatus: 'created'
      }
    ])

    const companyName = organisationDetails.organisation.companyName

    await organisationsPage.open()
    await organisationsPage.searchFor(companyName)
    await organisationsPage.viewLink(1)
    await organisationOverviewPage.viewRegistrationLink(1)

    expect(await registrationOverviewPage.getAccreditationStatus()).toBe(
      'created'
    )

    // created -> rejected: refuse the application (PAE-1618)
    await registrationOverviewPage.clickAccreditationAction('Reject')
    expect(await transitionPage.getHeading()).toBe('Reject accreditation')
    await transitionPage.confirm('Reject now')

    expect(await registrationOverviewPage.getAccreditationStatus()).toBe(
      'rejected'
    )

    // rejected -> created: reopen the application for rework (PAE-1623)
    await registrationOverviewPage.clickAccreditationAction('Reopen')
    expect(await transitionPage.getHeading()).toBe('Reopen accreditation')
    await transitionPage.confirm('Reopen now')

    expect(await registrationOverviewPage.getAccreditationStatus()).toBe(
      'created'
    )

    // created -> approved: grant, issuing the accreditation number
    await registrationOverviewPage.clickAccreditationAction('Approve')
    expect(await transitionPage.getHeading()).toBe('Approve accreditation')
    await transitionPage.fillGrantFields({
      day: '1',
      month: '1',
      year: `${new Date().getFullYear()}`,
      accreditationNumber: 'ACC234571'
    })
    await transitionPage.confirm('Approve now')

    expect(await registrationOverviewPage.getAccreditationStatus()).toBe(
      'approved'
    )

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
