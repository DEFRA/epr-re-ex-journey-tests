import { test, expect } from '@playwright/test'

import { DashboardPage } from 'page-objects/dashboard.page'
import { RegisteredOnlyPeriodPage } from 'page-objects/regulator/registered-only-period.page'
import { RegistrationDetailsPage } from 'page-objects/regulator/registration.details.page'
import { RegulatorHomePage } from 'page-objects/regulator/home.page'
import { RegulatorLoginPage } from 'page-objects/regulator/login.page'
import { WasteBalanceLedgerPage } from 'page-objects/waste.balance.ledger.page'
import { seedRegisteredOnlySubmittedSummaryLog } from '../../support/seeding/regulator-read.js'

// A ledger Date cell, e.g. "18 August 2026, 5:06pm".
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

    // No accreditation: the only shape that files a log into a
    // registered-only ledger.
    const seeded = await seedRegisteredOnlySubmittedSummaryLog()

    await loginPage.loginAsRegulator()

    await homePage.searchFor(seeded.companyName)
    await homePage.actionLink(1).click()

    expect(await dashboardPage.dashboardHeaderText()).toContain(
      seeded.companyName
    )

    await dashboardPage.selectLink(1)

    expect(await detailsPage.headingText()).toContain('Registration details')

    // The page filters events by createdAt, so open the submission year.
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

    // Never accredited, so the whole year is registered-only time.
    await expect(registeredOnlyPage.noDataMessage()).toHaveCount(0)

    // Not the accreditation page's "Waste balance ledger", so the shared page
    // object's heading reader would look for the wrong words.
    await expect(
      page.getByRole('heading', { name: 'Ledger', exact: true })
    ).toBeVisible()

    // No wait needed: the backend commits the ledger event before it marks the
    // log submitted, and the seed waits for that.
    const ledgerEvents = await ledgerPage.eventRows()

    // Rows below are keyed by these headings. No balance columns - showing the
    // tonnage here is PAE-1935.
    expect([...ledgerEvents[0].keys()]).toEqual([
      'Date',
      'Event',
      'Who',
      'Actions'
    ])

    const [submission] = ledgerEvents

    // The only event kind such a ledger can hold - the backend refuses PRN
    // events without an accreditation.
    expect(submission.get('Event')).toBe('Summary log submitted')

    expect(submission.get('Actions')).toContain('Download')

    expect(submission.get('Who')).toContain('@')

    // The value belongs to the run, so pin the shape.
    expect(submission.get('Date')).toMatch(LEDGER_TIMESTAMP)

    // A regulator reads and does not write.
    expect(await registeredOnlyPage.changeControlCount()).toBe(0)

    // The download is the point of the Actions column, so it is followed
    // rather than merely asserted to be there.
    const href = await ledgerPage.downloadLink().getAttribute('href')

    expect(href).toBeTruthy()

    const attachment = await registeredOnlyPage.fetchAttachment(href ?? '')

    expect(attachment.status).toBe(200)
    expect(attachment.byteLength).toBeGreaterThan(0)

    // Named for the registration and the moment of submission, not for the
    // file the operator happened to upload. The moment belongs to the run.
    expect(attachment.contentDisposition).toMatch(
      new RegExp(
        `attachment; filename="${seeded.registrationNumber}-\\d{4}-\\d{2}-\\d{2}-\\d{6}\\.xlsx"`
      )
    )
  })
})
