import { test, expect } from '@playwright/test'

import { AdminLoginPage } from 'page-objects/admin/login.page'
import { OrganisationsPage } from 'page-objects/admin/organisations.page'
import { OrganisationOverviewPage } from 'page-objects/admin/organisation.overview.page'
import { AccreditationAssignPage } from 'page-objects/admin/accreditation.assign.page'
import {
  createLinkedOrganisation,
  getOrganisation,
  rewriteOrganisation,
  unlinkAccreditation,
  updateMigratedOrganisation
} from '../../support/apicalls.js'

// The pair the journey repairs.
const CANDIDATE_REGISTRATION_NUMBER = 'R25SR500030925AL'
const CANDIDATE_REPROCESSING_TYPE = 'input'
// A second, already-linked pair of a different material and site, present only
// so the candidate list has something to leave out.
const OTHER_REGISTRATION_NUMBER = 'R25SR500030924ST'
const OTHER_ACCREDITATION_NUMBER = 'ACC234574'

// The assign form labels each candidate exactly
// "<registration number> - <material> - <reprocessing type>" (PAE-1816).
const EXPECTED_CANDIDATE = `${CANDIDATE_REGISTRATION_NUMBER} - aluminium - ${CANDIDATE_REPROCESSING_TYPE}`

/**
 * @typedef {{
 *   id: string,
 *   reprocessingType?: string,
 *   site: { address: { line1: string } }
 * }} SeededAccreditation
 */

/**
 * An accreditation is unlinked when no registration holds its id. The backend
 * derives it the same way rather than flagging the record, so the test reads
 * it the same way rather than trusting an index.
 *
 * @param {{ registrations: Array<{ accreditationId?: string }>,
 *           accreditations: SeededAccreditation[] }} organisation
 * @returns {SeededAccreditation | undefined}
 */
function unlinkedAccreditationOf(organisation) {
  const linkedIds = new Set(
    organisation.registrations.map((reg) => reg.accreditationId).filter(Boolean)
  )
  return organisation.accreditations.find((acc) => !linkedIds.has(acc.id))
}

// An accreditation that no registration claims is a real production state:
// once a registration carries a reprocessing type its identity key no longer
// matches an accreditation applied for later, so automatic linking silently
// passes it over. PAE-1816 gives a regulator the means to pair them by hand,
// which also copies the reprocessing type across — without that copy the very
// write meant to fix the pair would be rejected for mismatching keys.
test.describe('Admin assign an unlinked accreditation', () => {
  test.describe.configure({ timeout: 3 * 60 * 1000 })

  test.beforeEach(async ({ page }) => {
    const loginPage = new AdminLoginPage(page)
    await loginPage.loginAsServiceMaintainer()
  })

  test('assigns an unlinked accreditation to its registration through the admin UI @admin @accreditationassign', async ({
    page
  }) => {
    const organisationsPage = new OrganisationsPage(page)
    const organisationOverviewPage = new OrganisationOverviewPage(page)
    const assignPage = new AccreditationAssignPage(page)

    // Two reprocessor pairs. The steel one stays linked and approved so it can
    // never be a candidate — different material, different site, and already
    // claimed. The aluminium one is detached to become the orphan under test.
    // The detached row comes last because updateMigratedOrganisation walks the
    // accreditations in step with the registrations that still have one.
    const organisationDetails = await createLinkedOrganisation([
      { material: 'Steel (R4)', wasteProcessingType: 'Reprocessor' },
      { material: 'Aluminium (R4)', wasteProcessingType: 'Reprocessor' }
    ])
    const orgId = organisationDetails.refNo

    // Detach before anything writes a reprocessing type: while the two are
    // still linked, setting one on the registration alone breaks the pair.
    await unlinkAccreditation(orgId, 1)

    await updateMigratedOrganisation(orgId, [
      {
        regNumber: OTHER_REGISTRATION_NUMBER,
        accNumber: OTHER_ACCREDITATION_NUMBER,
        status: 'approved',
        reprocessingType: 'output'
      },
      {
        regNumber: CANDIDATE_REGISTRATION_NUMBER,
        status: 'approved',
        reprocessingType: CANDIDATE_REPROCESSING_TYPE,
        // No accreditation is this registration's to update any more — that
        // nothing links them is the whole point of the fixture.
        withoutAccreditation: true
      }
    ])

    const seededOrganisation = await getOrganisation(orgId)
    const orphan = unlinkedAccreditationOf(seededOrganisation)
    if (!orphan) {
      throw new Error('Seeding left no unlinked accreditation to assign')
    }
    // The orphan carries no reprocessing type of its own, so the value found
    // on it at the end can only have come from the registration
    expect(orphan.reprocessingType).toBeUndefined()

    const companyName = organisationDetails.organisation.companyName

    await organisationsPage.open()
    await organisationsPage.searchFor(companyName)
    await organisationsPage.viewLink(1)

    expect(await organisationOverviewPage.getHeaderText()).toEqual(companyName)

    const otherRow = {
      registrationNumber: OTHER_REGISTRATION_NUMBER,
      registrationStatus: 'approved',
      processingType: 'reprocessor - output',
      material: 'steel',
      site: organisationDetails.registrations[0].streetAddress,
      accreditationNumber: OTHER_ACCREDITATION_NUMBER,
      accreditationStatus: 'approved'
    }
    const candidateRow = {
      registrationNumber: CANDIDATE_REGISTRATION_NUMBER,
      registrationStatus: 'approved',
      processingType: `reprocessor - ${CANDIDATE_REPROCESSING_TYPE}`,
      material: 'aluminium',
      site: organisationDetails.registrations[1].streetAddress,
      accreditationNumber: '-',
      accreditationStatus: '-'
    }

    // The orphan is an extra row appended after the registrations, with the
    // registration columns dashed and its own accreditation detail shown. Its
    // site is the accreditation's own address, not the registration's — the
    // two are paired on postcode, not on street.
    expect(await organisationOverviewPage.getRegistrationsTableData()).toEqual([
      otherRow,
      candidateRow,
      {
        registrationNumber: '-',
        registrationStatus: '-',
        processingType: 'reprocessor',
        material: 'aluminium',
        site: orphan.site.address.line1,
        accreditationNumber: '-',
        accreditationStatus: 'created'
      }
    ])

    await organisationOverviewPage.clickAssignToRegistration()

    // Only the aluminium registration qualifies: the steel one differs in
    // material and site and has an accreditation of its own already
    expect(await assignPage.getRegistrationOptions()).toEqual([
      EXPECTED_CANDIDATE
    ])

    await assignPage.selectRegistration(EXPECTED_CANDIDATE)
    await assignPage.confirm()

    // Back on the overview, the two registrations are all that is left
    await expect(organisationOverviewPage.registrationRows()).toHaveCount(2)
    expect(await organisationOverviewPage.getRegistrationsTableData()).toEqual([
      otherRow,
      {
        ...candidateRow,
        // The accreditation now sits on its registration's row. It is still
        // unapproved, so it has no number to show.
        accreditationNumber: '',
        accreditationStatus: 'created'
      }
    ])

    const assignedOrganisation = await getOrganisation(orgId)
    const candidateRegistration = assignedOrganisation.registrations.find(
      (registration) =>
        registration.registrationNumber === CANDIDATE_REGISTRATION_NUMBER
    )
    expect(candidateRegistration.accreditationId).toBe(orphan.id)
    expect(unlinkedAccreditationOf(assignedOrganisation)).toBeUndefined()

    // Assigning copies the registration's reprocessing type onto the
    // accreditation in the same write. Without it their identity keys would
    // differ and the pair would be unsaveable from then on.
    const assignedAccreditation = assignedOrganisation.accreditations.find(
      (accreditation) => accreditation.id === orphan.id
    )
    expect(assignedAccreditation.reprocessingType).toBe(
      CANDIDATE_REPROCESSING_TYPE
    )

    // That check runs on every write, so a no-op rewrite proves the pair the
    // admin UI has just made is consistent
    await rewriteOrganisation(orgId)
  })
})
