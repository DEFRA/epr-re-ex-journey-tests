import { test, expect } from '@playwright/test'

import { AdminLoginPage } from 'page-objects/admin/login.page'
import { OrganisationsPage } from 'page-objects/admin/organisations.page'
import { OrganisationOverviewPage } from 'page-objects/admin/organisation.overview.page'
import { RegistrationOverviewPage } from 'page-objects/admin/registration.overview.page'
import { WasteBalanceEventsPage } from 'page-objects/admin/waste.balance.events.page'
import { seedDecemberWasteBalance } from '../../support/seeding/december-waste-balance.js'

const NUMBER_COLUMN = 'Number'
const DECEMBER_BALANCE_COLUMN = 'December closing balance'
const DECEMBER_AVAILABLE_COLUMN = 'December closing available'

// Events count from one in submission order, so the first is the non-December
// submission and the second is the December resubmission.
const NON_DECEMBER_EVENT = '1'
const DECEMBER_EVENT = '2'

// The backend omits the December fields until a balance holds a December
// portion, which the page renders as a dash.
const ABSENT = '-'

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
    // page is reloaded until both events are present rather than read once
    // against a page that may still predate the second submission.
    await expect
      .poll(
        async () => {
          await page.reload()
          return (await eventsPage.eventRows()).length
        },
        { timeout: 20000, intervals: [1000, 2000, 2000] }
      )
      .toBe(2)

    const rows = await eventsPage.eventRows()
    const byNumber = new Map(rows.map((row) => [row.get(NUMBER_COLUMN), row]))

    const nonDecemberEvent = byNumber.get(NON_DECEMBER_EVENT)
    const decemberEvent = byNumber.get(DECEMBER_EVENT)
    if (!nonDecemberEvent || !decemberEvent) {
      throw new Error('Expected both the non-December and December events')
    }

    // The non-December submission's event carries no December portion, so both
    // December columns read as a dash.
    expect(nonDecemberEvent.get(DECEMBER_BALANCE_COLUMN)).toBe(ABSENT)
    expect(nonDecemberEvent.get(DECEMBER_AVAILABLE_COLUMN)).toBe(ABSENT)

    // The December submission's event carries the portion, so both December
    // columns show a positive amount alongside the total.
    expect(Number(decemberEvent.get(DECEMBER_BALANCE_COLUMN))).toBeGreaterThan(
      0
    )
    expect(
      Number(decemberEvent.get(DECEMBER_AVAILABLE_COLUMN))
    ).toBeGreaterThan(0)
  })
})
