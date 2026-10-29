import { test, expect } from '@playwright/test'

import { AdminLoginPage } from 'page-objects/admin/login.page'
import { OrganisationsPage } from 'page-objects/admin/organisations.page'
import { OrganisationOverviewPage } from 'page-objects/admin/organisation.overview.page'
import { RegistrationOverviewPage } from 'page-objects/admin/registration.overview.page'
import { RegistrationYearPage } from 'page-objects/admin/registration.year.page'
import {
  createLinkedOrganisation,
  updateMigratedOrganisation
} from '../../support/seeding/organisation.js'
import { generateNumbers } from '../../support/reg-acc-number.js'
import { currentYear } from '../../support/date.js'

const openRegistrationOverview = async (page, companyName) => {
  const organisationsPage = new OrganisationsPage(page)
  const organisationOverviewPage = new OrganisationOverviewPage(page)

  await organisationsPage.open()
  await organisationsPage.searchFor(companyName)
  await organisationsPage.viewLink(1)
  await organisationOverviewPage.viewRegistrationLink(1)
}

test.describe('Registration overview years', () => {
  test.beforeEach(async ({ page }) => {
    const loginPage = new AdminLoginPage(page)
    await loginPage.loginAsServiceMaintainer()
  })

  test('An accredited year opens its accreditation year page @organisations', async ({
    page
  }) => {
    const registrationOverviewPage = new RegistrationOverviewPage(page)
    const registrationYearPage = new RegistrationYearPage(page)
    const year = currentYear()

    const linkedOrganisation = await createLinkedOrganisation([
      { material: 'Paper or board (R3)', wasteProcessingType: 'Reprocessor' }
    ])
    const { regNumber, accNumber } = generateNumbers({
      wasteProcessingType: 'reprocessorInput',
      materialSuffix: 'PA'
    })
    await updateMigratedOrganisation(linkedOrganisation.refNo, [
      { regNumber, accNumber, status: 'approved', reprocessingType: 'input' }
    ])
    const { companyName } = linkedOrganisation.organisation

    await openRegistrationOverview(page, companyName)

    const yearsData = await registrationOverviewPage.getYearsTableData()
    expect(yearsData[0]).toEqual({
      year: `${year}`,
      registrationStatus: 'approved',
      accreditationStatus: 'approved',
      accreditationNumber: accNumber
    })

    await registrationOverviewPage.viewYear(year)

    expect(await registrationYearPage.getHeaderText()).toEqual(
      `${companyName} - ${regNumber} - ${year} accredited`
    )
    await expect(registrationYearPage.reportsTable()).toBeVisible()
    await expect(registrationYearPage.prnActivityDownloadLink()).toBeVisible()
  })

  test('A registered-only year opens its registered-only year page @organisations', async ({
    page
  }) => {
    const registrationOverviewPage = new RegistrationOverviewPage(page)
    const registrationYearPage = new RegistrationYearPage(page)
    const year = currentYear()

    const linkedOrganisation = await createLinkedOrganisation([
      {
        material: 'Paper or board (R3)',
        wasteProcessingType: 'Reprocessor',
        withoutAccreditation: true
      }
    ])
    const { regNumber } = generateNumbers({
      wasteProcessingType: 'reprocessorInput',
      materialSuffix: 'PA'
    })
    await updateMigratedOrganisation(linkedOrganisation.refNo, [
      {
        regNumber,
        status: 'approved',
        reprocessingType: 'input',
        withoutAccreditation: true
      }
    ])
    const { companyName } = linkedOrganisation.organisation

    await openRegistrationOverview(page, companyName)

    const yearsData = await registrationOverviewPage.getYearsTableData()
    expect(yearsData[0]).toEqual({
      year: `${year}`,
      registrationStatus: 'approved',
      accreditationStatus: 'Not accredited',
      accreditationNumber: '-'
    })

    await registrationOverviewPage.viewYear(year)

    expect(await registrationYearPage.getHeaderText()).toEqual(
      `${companyName} - ${regNumber} - ${year} registered only`
    )
    await expect(registrationYearPage.reportsTable()).toBeVisible()
    await expect(registrationYearPage.prnActivityDownloadLink()).toHaveCount(0)
  })
})
