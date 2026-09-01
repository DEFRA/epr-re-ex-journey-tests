import { test, expect } from '@playwright/test'

import { DashboardPage } from 'page-objects/dashboard.page'
import { AccreditationDetailsPage } from 'page-objects/regulator/accreditation.details.page'
import { RegistrationDetailsPage } from 'page-objects/regulator/registration.details.page'
import { RegulatorHomePage } from 'page-objects/regulator/home.page'
import { RegulatorLoginPage } from 'page-objects/regulator/login.page'
import { seedAwaitingPrnAndSubmittedReport } from '../../support/seeding/regulator-read.js'

test.describe('A regulator reading an accreditation @regulator', () => {
  test('opens an accredited period from the registration and reads the accreditation it names @regulatoraccreditation', async ({
    page
  }) => {
    const loginPage = new RegulatorLoginPage(page)
    const homePage = new RegulatorHomePage(page)
    const dashboardPage = new DashboardPage(page)
    const registrationPage = new RegistrationDetailsPage(page)
    const accreditationPage = new AccreditationDetailsPage(page)

    const seeded = await seedAwaitingPrnAndSubmittedReport()

    await loginPage.loginAsRegulator()

    await homePage.searchFor(seeded.companyName)
    await homePage.actionLink(1).click()
    await dashboardPage.selectLink(1)

    expect(await registrationPage.headingText()).toContain(
      'Registration details'
    )

    // A regulator holds no record ids to build a path from, so keep the one the
    // search found to compare the way back against.
    const registrationUrl = page.url()

    // The accredited period is the only way in, so opening it is what says the
    // registration page links to an address that now resolves.
    await registrationPage.actionLink(1).click()

    // The caption sits inside the h1, so the heading is matched rather than
    // anchored. The period it names is what a regulator opened the page for.
    expect(await accreditationPage.headingText()).toMatch(
      /Accreditation \d{1,2} [A-Z][a-z]+ \d{4} - (Current|\d{1,2} [A-Z][a-z]+ \d{4})/
    )

    const caption = await accreditationPage.captionText()
    expect(caption).toContain(seeded.companyName)
    expect(caption).toContain(seeded.registrationNumber)
    expect(caption).toContain(seeded.accreditationNumber)

    await expect(page).toHaveTitle(
      new RegExp(`${seeded.accreditationNumber}: Accreditation details`)
    )

    const summary = await accreditationPage.summary()

    expect(summary['Accreditation status']).toBe('Approved')
    expect(summary['Accreditation number']).toBe(seeded.accreditationNumber)

    // Comparing the whole set is what says "and nothing else". The design also
    // shows two waste balance rows, which belong to a later story, so one
    // arriving here early has to be justified rather than pass unnoticed.
    expect(Object.keys(summary)).toStrictEqual([
      'Accreditation status',
      'Accreditation number'
    ])

    expect(await accreditationPage.breadcrumbs()).toStrictEqual([
      'All organisations',
      seeded.companyName,
      'Registration details',
      'Accreditation details'
    ])

    // A regulator reads and does not write, the same claim the registration
    // page above makes for itself.
    expect(await accreditationPage.changeControlCount()).toBe(0)

    // Getting back to the registration is an acceptance criterion, so the
    // crumb is followed rather than merely asserted to be present.
    await accreditationPage.registrationLink().click()
    expect(page.url()).toBe(registrationUrl)
  })
})
