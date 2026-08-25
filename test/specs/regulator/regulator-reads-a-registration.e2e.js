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

    // A regulator holds no organisation id, so search is the only way in. The
    // seeded company name carries a random suffix, so one row comes back.
    await homePage.searchFor(seeded.companyName)
    await homePage.openOrganisation(1)

    expect(await dashboardPage.dashboardHeaderText()).toContain(
      seeded.companyName
    )

    await dashboardPage.selectLink(1)

    // The address is the operator's own registration address. An operator
    // opening it gets the dashboard they manage the registration from; this
    // says the regulator got the record of what it covers instead.
    expect(await detailsPage.headingText()).toContain('Registration details')

    // The caption is the only thing on the page that says which registration
    // this is, so it names both the organisation and the number.
    const caption = await detailsPage.captionText()
    expect(caption).toContain(seeded.companyName)
    expect(caption).toContain(seeded.registrationNumber)

    await expect(page).toHaveTitle(
      new RegExp(`${seeded.registrationNumber}: Registration details`)
    )

    // What the registration covers, read back off the page. The seed
    // registers one input reprocessor of paper and board at a site, so every
    // value here says the page rendered the seeded record rather than a shell.
    const summary = await detailsPage.summary()

    expect(summary.Status).toBe('Approved')
    expect(summary['Processing type']).toBe('Reprocessor (input)')
    expect(summary.Material).toBe('Paper and board')

    // The seed's address is generated, so the row is asserted to be there and
    // to say something rather than to say one particular thing.
    expect(summary.Site).toBeTruthy()

    // Comparing the whole set is what says the page shows these and nothing
    // else. Overseas sites and the remaining registration data are both drawn
    // on the design and neither is built, so a row arriving for either has to
    // be justified rather than appearing unnoticed.
    expect(Object.keys(summary)).toStrictEqual([
      'Status',
      'Processing type',
      'Material',
      'Site'
    ])

    // The accredited periods the registration holds. The seed grants one
    // accreditation, so one row, and its number is what says the row is the
    // seeded accreditation rather than any other.
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

    // A period runs from a date to a date, or to the present where it is still
    // running. The seed's accreditation is approved and open, so it reads as
    // the second of those.
    expect(periods[0].get('Date range')).toMatch(
      /^\d{1,2} [A-Z][a-z]+ \d{4} - (Current|\d{1,2} [A-Z][a-z]+ \d{4})$/
    )

    // Every action link reads the same, so the hidden half of its name is what
    // tells a reader which accreditation it opens.
    expect(await detailsPage.actionLink(1).innerText()).toContain(
      'View accreditation'
    )
    expect(await detailsPage.getActionHiddenText(1)).toBe(
      seeded.accreditationNumber
    )

    // The trail back up the hierarchy. A regulator's home is the organisation
    // list, so the list is named once rather than twice.
    expect(await detailsPage.breadcrumbs()).toStrictEqual([
      'All organisations',
      seeded.companyName,
      'Registration details'
    ])

    // The action opens the accreditation the row names, at the address the
    // page hierarchy gives it.
    expect(await detailsPage.actionLink(1).getAttribute('href')).toContain(
      `/accreditations/${seeded.accreditationId}`
    )

    // Everything the page offers a reader, and nothing more. A regulator reads
    // what an operator recorded and records nothing, so the one route out is
    // the accreditation the table names. Record ids are masked, so this is the
    // shape of the routes rather than which records they name.
    expect(await detailsPage.offeredRoutes()).toStrictEqual([
      '/organisations/{id}/registrations/{id}/accreditations/{id}'
    ])
    expect(await detailsPage.changeControlCount()).toBe(0)
  })
})
