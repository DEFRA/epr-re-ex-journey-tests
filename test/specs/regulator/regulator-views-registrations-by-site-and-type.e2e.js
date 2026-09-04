import { test, expect } from '@playwright/test'

import { RegulatorHomePage } from 'page-objects/regulator/home.page'
import { RegulatorLoginPage } from 'page-objects/regulator/login.page'
import { RegulatorOrganisationPage } from 'page-objects/regulator/organisation.page'
import { seedMultiSiteMultiTypeOrganisation } from '../../support/seeding/regulator-read.js'

test.describe('A regulator viewing registrations grouped by site and by type @regulator', () => {
  test('sees reprocessor registrations grouped by site, exporter registrations on their own tab, and an accreditation only where the registration carries one @regulatorRegistrationsBySiteAndType', async ({
    page
  }) => {
    const loginPage = new RegulatorLoginPage(page)
    const homePage = new RegulatorHomePage(page)
    const organisationPage = new RegulatorOrganisationPage(page)

    const seeded = await seedMultiSiteMultiTypeOrganisation()

    await loginPage.loginAsRegulator()

    await homePage.searchFor(seeded.companyName)
    await homePage.actionLink(1).click()

    expect(await organisationPage.captionText()).toBe(seeded.companyName)

    // The organisation reprocesses and exports, so this page offers a tab for
    // each - and the Reprocessor tab is where the results row's View link
    // lands, so it is asserted selected without navigating anywhere first.
    expect(await organisationPage.tabs().allInnerTexts()).toEqual([
      'Reprocessor',
      'Exporter'
    ])

    // The two reprocessor registrations sit at two different sites, so
    // counting the tables is what says the record grouped them by site
    // rather than listing both in one table - a flat list of two rows would
    // read identically cell by cell.
    await expect(organisationPage.siteTables()).toHaveCount(2)

    expect(
      await organisationPage.siteTable(1).locator('caption').innerText()
    ).toBe(seeded.inputSite)
    expect(
      await organisationPage.siteTable(2).locator('caption').innerText()
    ).toBe(seeded.outputSite)

    // The input registration carries an accreditation, and its whole row is
    // compared so a renamed or reordered column names itself in the failure.
    expect(await organisationPage.registrations(1)).toEqual([
      new Map([
        ['Registration number', seeded.inputRegistrationNumber],
        ['Registration status', 'Approved'],
        ['Material', 'Paper and board'],
        ['Regulator', 'EA'],
        ['Accreditation', 'Approved'],
        ['Actions', `View ${seeded.inputRegistrationNumber}`]
      ])
    ])

    // The output registration carries none, which is the case the rest of
    // the regulator suite never seeds - so this is what proves the
    // Accreditation column reads "Not applicable" rather than staying empty
    // or repeating the registration's own status.
    expect(await organisationPage.registrations(2)).toEqual([
      new Map([
        ['Registration number', seeded.outputRegistrationNumber],
        ['Registration status', 'Approved'],
        ['Material', 'Steel'],
        ['Regulator', 'EA'],
        ['Accreditation', 'Not applicable'],
        ['Actions', `View ${seeded.outputRegistrationNumber}`]
      ])
    ])

    // The Exporter tab is a distinct route rather than a client-side panel,
    // so it is reached by following the tab link.
    await organisationPage.tabs().nth(1).click()

    expect(await organisationPage.tabs().allInnerTexts()).toEqual([
      'Reprocessor',
      'Exporter'
    ])

    // Exporters hold no UK processing site, so their table is not grouped
    // under one: exactly one table, and it carries no site caption at all -
    // the grouping a reprocessor gets is not offered here, and that absence
    // is itself part of what "shown apart" means.
    await expect(organisationPage.siteTables()).toHaveCount(1)
    await expect(organisationPage.siteTable(1).locator('caption')).toHaveCount(
      0
    )

    expect(await organisationPage.registrations(1)).toEqual([
      new Map([
        ['Registration number', seeded.exporterRegistrationNumber],
        ['Registration status', 'Approved'],
        ['Material', 'Plastic'],
        ['Regulator', 'EA'],
        ['Accreditation', 'Approved'],
        ['Actions', `View ${seeded.exporterRegistrationNumber}`]
      ])
    ])
  })
})
