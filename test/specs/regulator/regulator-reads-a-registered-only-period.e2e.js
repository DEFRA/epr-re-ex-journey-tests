import { test, expect } from '@playwright/test'

import { DashboardPage } from 'page-objects/dashboard.page'
import { RegisteredOnlyPeriodPage } from 'page-objects/regulator/registered-only-period.page'
import { RegistrationDetailsPage } from 'page-objects/regulator/registration.details.page'
import { RegulatorHomePage } from 'page-objects/regulator/home.page'
import { RegulatorLoginPage } from 'page-objects/regulator/login.page'
import { WasteBalanceLedgerPage } from 'page-objects/waste.balance.ledger.page'
import { seedRegisteredOnlySubmittedSummaryLog } from '../../support/seeding/regulator-read.js'

// A ledger Date cell, e.g. "18 August 2026, 5:06pm". The same shape the
// accreditation page's ledger states, this being the same table.
const LEDGER_TIMESTAMP = /^\d{1,2} [A-Z][a-z]+ \d{4}, \d{1,2}:\d{2}(am|pm)$/

test.describe('A regulator reading a registered-only period @regulator', () => {
  test('opens the year a registration was only registered and reads the ledger it kept @regulatorRegisteredOnlyLedger', async ({
    page
  }) => {
    const loginPage = new RegulatorLoginPage(page)
    const homePage = new RegulatorHomePage(page)
    const dashboardPage = new DashboardPage(page)
    const detailsPage = new RegistrationDetailsPage(page)
    const registeredOnlyPage = new RegisteredOnlyPeriodPage(page)
    const ledgerPage = new WasteBalanceLedgerPage(page)

    // The registration carries no accreditation at all, which is the only
    // shape that files a summary log into a registered-only ledger.
    const seeded = await seedRegisteredOnlySubmittedSummaryLog()

    await loginPage.loginAsRegulator()

    await homePage.searchFor(seeded.companyName)
    await homePage.actionLink(1).click()

    expect(await dashboardPage.dashboardHeaderText()).toContain(
      seeded.companyName
    )

    await dashboardPage.selectLink(1)

    expect(await detailsPage.headingText()).toContain('Registration details')

    // The year the log was submitted in is the year the page filters its
    // events to, so it is the row this journey opens.
    const periods = await detailsPage.registeredOnlyPeriods()
    const seededRow =
      periods.findIndex(
        (row) => row.get('Period') === String(seeded.submissionYear)
      ) + 1

    expect(seededRow).toBeGreaterThan(0)

    await detailsPage.registeredOnlyActionLink(seededRow).click()

    expect(await registeredOnlyPage.headingText()).toContain(
      `${seeded.submissionYear} Registered-only periods`
    )

    // This registration was never accredited, so the year holds registered-only
    // time throughout and the page carries data rather than the empty state.
    await expect(registeredOnlyPage.noDataMessage()).toHaveCount(0)

    await expect(ledgerPage.heading()).toBeVisible()

    // No wait is needed for the event to exist. The backend syncs the waste
    // records - which is what commits the ledger event - before it transitions
    // the summary log to submitted, and the seed already waits for that
    // status. So a log that reads as submitted has its ledger event written.
    const ledgerEvents = await ledgerPage.eventRows()

    // The six columns the ledger states, in the order it states them. The row
    // below is keyed by these headings, so naming them here is what stops a
    // renamed column reading as a missing cell.
    expect([...ledgerEvents[0].keys()]).toEqual([
      'Date',
      'Event',
      'Tonnage',
      'Waste balance available (tonnes)',
      'Who',
      'Actions'
    ])

    const [submission] = ledgerEvents

    // A summary log submission is the only event a registered-only ledger can
    // hold: the backend refuses a note event in one, notes belonging to an
    // accreditation this registration does not have.
    expect(submission.get('Event')).toBe('Summary log submitted')

    // The registration holds no balance while it is only registered, so both
    // number columns say so rather than stating a running zero - and the row
    // offers no note to open, for want of an accreditation to hang one on.
    expect(submission.get('Tonnage')).toBe('N/A')
    expect(submission.get('Waste balance available (tonnes)')).toBe('N/A')
    expect(submission.get('Actions')).toBe('')

    expect(submission.get('Who')).toContain('@')

    // The timestamp belongs to the run rather than to this page, so its shape
    // is what is pinned.
    expect(submission.get('Date')).toMatch(LEDGER_TIMESTAMP)

    // A regulator reads and does not write, the same claim every other
    // regulator page makes for itself.
    expect(await registeredOnlyPage.changeControlCount()).toBe(0)
  })
})
