import {
  createLinkedOrganisation,
  updateMigratedOrganisation,
  FAKE_REGISTRATION_NUMBER,
  FAKE_ACCREDITATION_NUMBER
} from '~/test/support/seeding/organisation.js'
import { DashboardPage } from 'page-objects/dashboard.page.js'
import { WasteRecordsPage } from 'page-objects/waste.records.page.js'
import { test, expect } from '@playwright/test'
import { createLinkAndLogin } from '~/test/support/login-helper.js'

test.describe('Reapply for accreditation link @reapplyaccreditation', () => {
  test('renders on the registration card pointing at the WS2 renewal host', async ({
    page
  }) => {
    // The link is eligible only for a CURRENT-YEAR accreditation (the
    // build-reapply-accreditation gate) and only renders while the stack's
    // reapply window is open (compose sets an all-year window). Read the clock
    // once so the seeded accreditation year and the expected renewal year
    // cannot drift across a year boundary. This self-contained seed keeps the
    // check year-agnostic without coupling to any report-flow fixtures.
    const currentYear = new Date().getFullYear()

    const organisationDetails = await createLinkedOrganisation([
      { material: 'Plastic (R3)', wasteProcessingType: 'Exporter' }
    ])
    const organisationId = organisationDetails.refNo

    // The registration and accreditation numbers only need to exist to approve
    // the seed; nothing asserts them, so use the shared fake constants.
    const migrationResponse = await updateMigratedOrganisation(organisationId, [
      {
        regNumber: FAKE_REGISTRATION_NUMBER,
        accNumber: FAKE_ACCREDITATION_NUMBER,
        status: 'approved',
        validFrom: `${currentYear}-01-01`
      }
    ])
    const registrationId = migrationResponse.registrationIds[0]

    await createLinkAndLogin(page, organisationId, migrationResponse.email)

    // Land on the operator dashboard and open the plastic registration.
    const dashboardPage = new DashboardPage(page)
    await dashboardPage.selectTableLink(1, 1)

    const registrationPage = new WasteRecordsPage(page)
    const reapplyLink = registrationPage.reapplyAccreditationLink()
    await expect(reapplyLink).toBeVisible()

    // AC 10 is about the year the operator reads, so pin the visible text too:
    // the POM regex matches any year, leaving only the href to check it.
    await expect(reapplyLink).toHaveText(
      `apply for ${currentYear + 1} accreditation`
    )

    // The href reuses the org and registration ids that address this page, and
    // `plastic` is the material slug for the seed's 'Plastic (R3)'. The WS2 host
    // is environment-driven so only the path is pinned; new URL() throws on a
    // same-origin relative href, so absoluteness is covered.
    const href = await reapplyLink.getAttribute('href')
    const url = new URL(href ?? '')
    expect(url.pathname).toBe(
      `/operator-accreditation/${organisationId}/${registrationId}/plastic/${currentYear + 1}`
    )
  })
})
