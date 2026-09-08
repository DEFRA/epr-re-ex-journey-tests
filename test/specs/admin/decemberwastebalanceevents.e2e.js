import { test, expect } from '@playwright/test'

import { AdminLoginPage } from 'page-objects/admin/login.page'
import { OrganisationsPage } from 'page-objects/admin/organisations.page'
import { OrganisationOverviewPage } from 'page-objects/admin/organisation.overview.page'
import { RegistrationOverviewPage } from 'page-objects/admin/registration.overview.page'
import { WasteBalanceEventsPage } from 'page-objects/admin/waste.balance.events.page'
import { seedDecemberWasteBalance } from '../../support/seeding/december-waste-balance.js'

const DECEMBER_BALANCE_COLUMN = 'December closing balance'
const DECEMBER_AVAILABLE_COLUMN = 'December closing available'

// The backend omits the December fields until a balance holds a December
// portion, which the page renders as a dash. Anything else is the amount.
const ABSENT = '-'
const isAmount = (value) => value !== ABSENT && Number(value) > 0

test.describe('Waste balance events - December portion', () => {
  /** @type {Awaited<ReturnType<typeof seedDecemberWasteBalance>>} */
  let seeded

  test.beforeAll(async () => {
    seeded = await seedDecemberWasteBalance()
  })

  test('Should show the December closing and available amounts alongside the total @decemberWasteBalanceEvents', async ({
    page
  }) => {
    const loginPage = new AdminLoginPage(page)
    const organisationsPage = new OrganisationsPage(page)
    const organisationOverviewPage = new OrganisationOverviewPage(page)
    const registrationOverviewPage = new RegistrationOverviewPage(page)
    const eventsPage = new WasteBalanceEventsPage(page)

    await loginPage.loginAsServiceMaintainer()

    await organisationsPage.open()
    await organisationsPage.searchFor(seeded.companyName)
    await organisationsPage.viewLink(1)

    await organisationOverviewPage.viewRegistrationLink(1)

    await registrationOverviewPage.viewWasteBalanceEventsLink().click()

    const heading = await eventsPage.getHeaderText()
    expect(heading).toContain(seeded.accreditationNumber)

    // The December resubmission's ledger event is folded asynchronously, so the
    // page is reloaded until the December amount lands rather than read once
    // against a page that may still predate it.
    await expect
      .poll(
        async () => {
          await page.reload()
          const rows = await eventsPage.eventRows()
          return rows.some((row) => isAmount(row.get(DECEMBER_BALANCE_COLUMN)))
        },
        { timeout: 20000, intervals: [1000, 2000, 2000] }
      )
      .toBe(true)

    const rows = await eventsPage.eventRows()

    // The non-December submission's event carries no December portion, so both
    // December columns read as a dash.
    expect(rows.map((row) => row.get(DECEMBER_BALANCE_COLUMN))).toContain(
      ABSENT
    )
    expect(rows.map((row) => row.get(DECEMBER_AVAILABLE_COLUMN))).toContain(
      ABSENT
    )

    // The December submission's event carries the portion, so both December
    // columns show a positive amount alongside the total.
    const decemberRow = rows.find((row) =>
      isAmount(row.get(DECEMBER_BALANCE_COLUMN))
    )
    if (!decemberRow) {
      throw new Error('Expected an event carrying the December portion')
    }
    expect(Number(decemberRow.get(DECEMBER_BALANCE_COLUMN))).toBeGreaterThan(0)
    expect(Number(decemberRow.get(DECEMBER_AVAILABLE_COLUMN))).toBeGreaterThan(
      0
    )
  })
})
