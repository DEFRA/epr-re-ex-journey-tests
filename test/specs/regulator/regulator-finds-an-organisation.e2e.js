import { test, expect } from '@playwright/test'

import { DashboardPage } from 'page-objects/dashboard.page'
import { RegulatorHomePage } from 'page-objects/regulator/home.page'
import { RegulatorLoginPage } from 'page-objects/regulator/login.page'
import { WasteRecordsPage } from 'page-objects/waste.records.page'
import {
  createLinkedOrganisation,
  FAKE_ACCREDITATION_NUMBER,
  FAKE_REGISTRATION_NUMBER,
  updateMigratedOrganisation
} from '../../support/apicalls.js'

test.describe('A regulator looking up an operator @regulator', () => {
  test('finds an organisation by name, reads it, and is offered nothing to change @regulatorsearch', async ({
    page
  }) => {
    const loginPage = new RegulatorLoginPage(page)
    const homePage = new RegulatorHomePage(page)
    const dashboardPage = new DashboardPage(page)
    const registrationPage = new WasteRecordsPage(page)

    const linkedOrganisation = await createLinkedOrganisation([
      { material: 'Paper or board (R3)', wasteProcessingType: 'Reprocessor' }
    ])

    // Numbering the registration approves it, which is the state a regulator
    // has any reason to look at, and is what the Status column reads back.
    await updateMigratedOrganisation(linkedOrganisation.refNo, [
      {
        regNumber: FAKE_REGISTRATION_NUMBER,
        accNumber: FAKE_ACCREDITATION_NUMBER,
        status: 'approved',
        reprocessingType: 'input'
      }
    ])

    const { organisation } = linkedOrganisation

    await loginPage.loginAsRegulator()

    // A regulator holds no organisation id, so search is the only way in, and
    // the page they land on is the search itself.
    await homePage.searchFor(organisation.companyName)

    // The seeded company name carries a random suffix, so the whole result set
    // is one row - which asserts the size of it as well as the content.
    expect(await homePage.getTableData()).toEqual([
      {
        name: organisation.companyName,
        organisationId: `${linkedOrganisation.orgId}`,
        regulator: 'EA',
        // Approved rather than active: the organisation is never linked to a
        // Defra ID, which is what makes an approved organisation active.
        status: 'approved'
      }
    ])

    await homePage.openOrganisation(1)

    expect(await dashboardPage.dashboardHeaderText()).toContain(
      organisation.companyName
    )
    expect(await dashboardPage.getMaterial(1, 1)).toBe('Paper and board')
    expect(await dashboardPage.getRegistrationStatus(1, 1)).toBe('Approved')
    expect(await dashboardPage.getAccreditationStatus(1, 1)).toBe('Approved')

    await dashboardPage.selectLink(1)

    // The registration is where an operator issues PRNs, reports and reapplies
    // for accreditation. A regulator reads the same page and is offered the
    // PRNs and the reports to read, and nothing that changes either. Comparing
    // the whole set is what says "and nothing else" - a route added here later
    // has to be justified rather than arriving unnoticed.
    expect(await registrationPage.offeredRoutes()).toEqual([
      '/contact',
      '/organisations/{id}/registrations/{id}/accreditations/{id}/packaging-recycling-notes',
      '/organisations/{id}/registrations/{id}/reports'
    ])
  })
})
