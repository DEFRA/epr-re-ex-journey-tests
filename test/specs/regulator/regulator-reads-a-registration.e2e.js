import { test, expect } from '@playwright/test'

import { DashboardPage } from 'page-objects/dashboard.page'
import { RegistrationDetailsPage } from 'page-objects/regulator/registration.details.page'
import { RegulatorHomePage } from 'page-objects/regulator/home.page'
import { RegulatorLoginPage } from 'page-objects/regulator/login.page'
import { seedAwaitingPrnAndSubmittedReport } from '../../support/regulator-read-seed.js'

test.describe('A regulator reading a registration @regulator', () => {
  test('walks from the organisation list to a registration and reads what it covers and the periods it holds @regulatorregistration', async ({
    page
  }) => {
    const loginPage = new RegulatorLoginPage(page)
    const homePage = new RegulatorHomePage(page)
    const dashboardPage = new DashboardPage(page)
    const detailsPage = new RegistrationDetailsPage(page)

    const seeded = await seedAwaitingPrnAndSubmittedReport()

    await loginPage.loginAsRegulator()

    await homePage.searchFor(seeded.companyName)
    await homePage.openOrganisation(1)

    expect(await dashboardPage.dashboardHeaderText()).toContain(
      seeded.companyName
    )

    await dashboardPage.selectLink(1)

    expect(await detailsPage.headingText()).toContain('Registration details')

    const caption = await detailsPage.captionText()
    expect(caption).toContain(seeded.companyName)
    expect(caption).toContain(seeded.registrationNumber)

    await expect(page).toHaveTitle(
      new RegExp(`${seeded.registrationNumber}: Registration details`)
    )

    const summary = await detailsPage.summary()

    expect(summary.Status).toBe('Approved')
    expect(summary['Processing type']).toBe('Reprocessor (input)')
    expect(summary.Material).toBe('Paper and board')

    // The seed's address is generated, so the row is asserted to be there and
    // to say something rather than to say one particular thing.
    expect(summary.Site).toBeTruthy()

    expect(Object.keys(summary)).toStrictEqual([
      'Status',
      'Processing type',
      'Material',
      'Site'
    ])

    const periods = await detailsPage.accreditedPeriods()

    expect([...periods[0].keys()]).toStrictEqual([
      'Accreditation number',
      'Date range',
      'Accreditation status',
      'Actions'
    ])

    expect(periods.map((period) => period.get('Accreditation number'))).toEqual(
      [seeded.accreditationNumber]
    )
    expect(periods[0].get('Accreditation status')).toBe('Approved')

    expect(periods[0].get('Date range')).toMatch(
      /^\d{1,2} [A-Z][a-z]+ \d{4} - (Current|\d{1,2} [A-Z][a-z]+ \d{4})$/
    )

    expect(await detailsPage.actionLink(1).innerText()).toContain(
      'View accreditation'
    )
    expect(await detailsPage.getActionHiddenText(1)).toBe(
      seeded.accreditationNumber
    )

    expect(await detailsPage.breadcrumbs()).toStrictEqual([
      'All organisations',
      seeded.companyName,
      'Registration details'
    ])

    expect(await detailsPage.actionLink(1).getAttribute('href')).toContain(
      `/accreditations/${seeded.accreditationId}`
    )

    expect(await detailsPage.offeredRoutes()).toStrictEqual([
      '/organisations/{id}/registrations/{id}/accreditations/{id}'
    ])
    expect(await detailsPage.changeControlCount()).toBe(0)
  })
})
