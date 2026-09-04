import { test, expect } from '@playwright/test'

import { DashboardPage } from 'page-objects/dashboard.page'
import { AccreditationDetailsPage } from 'page-objects/regulator/accreditation.details.page'
import { RegisteredOnlyPeriodPage } from 'page-objects/regulator/registered-only-period.page'
import { RegistrationDetailsPage } from 'page-objects/regulator/registration.details.page'
import { RegulatorHomePage } from 'page-objects/regulator/home.page'
import { RegulatorLoginPage } from 'page-objects/regulator/login.page'
import { SEEDED_VALID_FROM } from '../../support/seeding/organisation.js'
import { seedAwaitingPrnAndSubmittedReport } from '../../support/seeding/regulator-read.js'
test.describe('A regulator reading a registration @regulator', () => {
  test('walks from the organisation list to a registration, reads what it covers and the periods it holds, then opens each kind and comes back @regulatorRegistration @regulatorAccreditation @regulatorRegisteredOnly', async ({
    page
  }) => {
    const loginPage = new RegulatorLoginPage(page)
    const homePage = new RegulatorHomePage(page)
    const dashboardPage = new DashboardPage(page)
    const detailsPage = new RegistrationDetailsPage(page)
    const accreditationPage = new AccreditationDetailsPage(page)
    const registeredOnlyPage = new RegisteredOnlyPeriodPage(page)

    const seeded = await seedAwaitingPrnAndSubmittedReport()

    await loginPage.loginAsRegulator()

    await homePage.searchFor(seeded.companyName)
    await homePage.actionLink(1).click()

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
      /^\d{1,2} [A-Z][a-z]+( \d{4})? to (Current|\d{1,2} [A-Z][a-z]+ \d{4})$/
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

    expect(await detailsPage.changeControlCount()).toBe(0)

    // A regulator holds no record ids to build a path from, so keep the one the
    // search found to compare the way back against.
    const registrationUrl = page.url()

    // The accredited period is the only way in, so opening it is what says the
    // link asserted above resolves rather than merely points somewhere.
    await detailsPage.actionLink(1).click()

    // The caption sits inside the h1, so the heading is matched rather than
    // anchored. The period it names is what a regulator opened the page for,
    // and it sits on its own line beneath the title.
    expect(await accreditationPage.headingText()).toMatch(
      /Accreditation\s+\d{1,2} [A-Z][a-z]+( \d{4})? to (Current|\d{1,2} [A-Z][a-z]+ \d{4})/
    )

    const accreditationCaption = await accreditationPage.captionText()
    expect(accreditationCaption).toContain(seeded.companyName)
    expect(accreditationCaption).toContain(seeded.registrationNumber)
    expect(accreditationCaption).toContain(seeded.accreditationNumber)

    await expect(page).toHaveTitle(
      new RegExp(`${seeded.accreditationNumber}: Accreditation details`)
    )

    const accreditationSummary = await accreditationPage.summary()

    expect(accreditationSummary['Accreditation status']).toBe('Approved')
    expect(accreditationSummary['Accreditation number']).toBe(
      seeded.accreditationNumber
    )

    // The seed submits a summary log and draws notes against it, so the balance
    // is a real tonnage. Its value belongs to the fixture rather than to this
    // page, so the format is what is pinned.
    expect(accreditationSummary['Waste balance available (tonnes)']).toMatch(
      /^\d{1,3}(,\d{3})*\.\d{2}$/
    )

    // Comparing the whole set is what says "and nothing else". The total the
    // accreditation has ever held is deliberately not shown beside the
    // available figure, so it arriving here has to be justified rather than
    // pass unnoticed.
    expect(Object.keys(accreditationSummary)).toStrictEqual([
      'Accreditation status',
      'Accreditation number',
      'Waste balance available (tonnes)'
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

    // The reports table is the record of what the operator owed under this
    // accreditation and what arrived against it. The seed submitted one
    // report, for the last completed period, and left every earlier period
    // unreported - so the one table holds a row of each kind.
    const { year, cadence, period } = seeded.reportPeriod

    // The period the seed chose moves with the run date, so its label is
    // derived from what was seeded rather than written down.
    const monthName = new Date(Date.UTC(year, period - 1)).toLocaleString(
      'en-GB',
      { month: 'long', timeZone: 'UTC' }
    )
    const periodLabel = `${monthName}, ${year}`

    expect(await accreditationPage.reportHeadings()).toStrictEqual([
      'Period',
      'Due date',
      'Submission date',
      'Status',
      'Actions'
    ])

    const reports = await accreditationPage.reports()

    // The table and the empty state are alternatives, so the table rendering
    // is only half the claim - the message being absent is the other half.
    expect(await accreditationPage.noReportsMessage().count()).toBe(0)

    // The seeded period is the most recent one to have ended, so finding it
    // first is what says the table is ordered most recent period first.
    expect(reports[0].get('Period')).toBe(periodLabel)
    expect(reports[0].get('Due date')).toMatch(/^\d{1,2} [A-Z][a-z]+ \d{4}$/)
    expect(reports[0].get('Status')).toBe('Submitted')

    // The submission's timestamp belongs to the run rather than to this page,
    // so the row is asserted to carry one rather than to carry a given one.
    expect(reports[0].get('Submission date')).toBeTruthy()

    expect(await accreditationPage.reportActionLink(1).innerText()).toContain(
      'View report'
    )
    expect(
      await accreditationPage.reportActionLink(1).getAttribute('href')
    ).toContain(`/reports/${year}/${cadence}/${period}/submissions/1/view`)

    // Every action link reads the same two words, so the period it names is
    // the only thing telling one row's link from another's.
    expect(await accreditationPage.getReportActionHiddenText(1)).toBe(
      periodLabel
    )

    // Earlier periods ended with nothing submitted against them, so the last
    // row is the other kind: a period that is owed rather than answered.
    expect(reports.length).toBeGreaterThan(1)

    const unreported = reports[reports.length - 1]

    expect(unreported.get('Submission date')).toBe('')
    expect(unreported.get('Status')).not.toBe('Submitted')
    expect(
      await accreditationPage.reportActionLink(reports.length).count()
    ).toBe(0)

    // Getting back to the registration is an acceptance criterion, so the
    // crumb is followed rather than merely asserted to be present.
    await accreditationPage.registrationLink().click()
    expect(new URL(page.url()).pathname).toBe(new URL(registrationUrl).pathname)

    // The registration also lists the years it ran over without an
    // accreditation. The seed grants both from the same date, so the year this
    // opens holds nothing - which is the acceptance criterion this journey is
    // here for.
    const registeredOnly = await detailsPage.registeredOnlyPeriods()

    expect([...registeredOnly[0].keys()]).toStrictEqual(['Period', 'Actions'])

    // A registration has no end date, so the list runs to the current year and
    // grows every January. The row the journey opens is the seeded start year,
    // found rather than assumed to be first.
    const seededYear = new Date(SEEDED_VALID_FROM).getUTCFullYear()
    const seededRow =
      registeredOnly.findIndex(
        (row) => row.get('Period') === String(seededYear)
      ) + 1

    expect(seededRow).toBeGreaterThan(0)

    expect(
      await detailsPage.registeredOnlyActionLink(seededRow).innerText()
    ).toContain('View reg-only period')

    // Every action link reads the same two words, so the year it names is the
    // only thing telling one row's link from another's.
    expect(await detailsPage.getRegisteredOnlyHiddenText(seededRow)).toBe(
      String(seededYear)
    )

    expect(
      await detailsPage.registeredOnlyActionLink(seededRow).getAttribute('href')
    ).toContain(`/registered-only-periods/${seededYear}`)

    await detailsPage.registeredOnlyActionLink(seededRow).click()

    expect(await registeredOnlyPage.headingText()).toContain(
      `${seededYear} Registered-only periods`
    )

    await expect(page).toHaveTitle(
      new RegExp(`${seededYear} Registered-only periods`)
    )

    const registeredOnlyCaption = await registeredOnlyPage.captionText()
    expect(registeredOnlyCaption).toContain(seeded.companyName)
    expect(registeredOnlyCaption).toContain(seeded.registrationNumber)

    // The seed is accredited from the day the registration starts, so this
    // period holds no data and says so in both sentences.
    await expect(registeredOnlyPage.noDataMessage()).toBeVisible()
    await expect(registeredOnlyPage.returnToRegistrationMessage()).toBeVisible()

    expect(await registeredOnlyPage.breadcrumbs()).toStrictEqual([
      'All organisations',
      seeded.companyName,
      'Registration details',
      `${seededYear} Registered-only periods`
    ])

    expect(await registeredOnlyPage.changeControlCount()).toBe(0)

    // Getting back is an acceptance criterion here too, so the crumb is
    // followed rather than asserted to be present.
    await registeredOnlyPage.registrationLink().click()
    expect(new URL(page.url()).pathname).toBe(new URL(registrationUrl).pathname)
  })
})
