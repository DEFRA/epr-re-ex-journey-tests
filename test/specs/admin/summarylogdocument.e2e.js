import { test, expect } from '@playwright/test'

import { AdminLoginPage } from 'page-objects/admin/login.page'
import { OrganisationsPage } from 'page-objects/admin/organisations.page'
import { OrganisationOverviewPage } from 'page-objects/admin/organisation.overview.page'
import { RegistrationOverviewPage } from 'page-objects/admin/registration.overview.page'
import { SummaryLogDocumentPage } from 'page-objects/admin/summary.log.document.page'
import { seedAdminActivityData } from '../../support/seeding/admin-activity.js'

// The shared seed uploads and submits a real reprocessor summary log (so its
// document carries a populated loadsByReportingPeriod); keep the generous
// timeout the other summary-log admin specs use.
test.describe('Admin summary log document view', () => {
  test.describe.configure({ timeout: 3 * 60 * 1000 })

  let seeded

  test.beforeAll(async () => {
    seeded = await seedAdminActivityData()
  })

  // Reaches the seeded reprocessor's registration overview through the admin
  // UI (search -> organisation -> registration), returning the page object
  // positioned on the registration overview.
  const openRegistrationOverview = async (page) => {
    const loginPage = new AdminLoginPage(page)
    const organisationsPage = new OrganisationsPage(page)
    const organisationOverviewPage = new OrganisationOverviewPage(page)
    const registrationOverviewPage = new RegistrationOverviewPage(page)

    await loginPage.loginAsServiceMaintainer()
    await organisationsPage.open()
    await organisationsPage.searchFor(seeded.companyName)
    await organisationsPage.viewLink(1)
    await organisationOverviewPage.viewRegistrationLink(1)

    return registrationOverviewPage
  }

  test('An admin opens a submitted summary log as pretty-printed JSON from the registration overview @summaryLogDocument', async ({
    page
  }) => {
    const registrationOverviewPage = await openRegistrationOverview(page)
    const summaryLogDocumentPage = new SummaryLogDocumentPage(page)

    // The Actions column offers View data alongside Download.
    const actionLinks =
      await registrationOverviewPage.getSummaryLogActionLinks(1)
    expect(actionLinks.map((link) => link.text)).toEqual([
      'View data',
      'Download'
    ])

    await registrationOverviewPage.clickViewSummaryLogData(1)

    // The document page names itself and lives at the summary-log URL.
    expect(await summaryLogDocumentPage.getHeaderText()).toEqual('Summary log')
    expect(page.url()).toMatch(/\/summary-logs\/[\w-]+$/)

    // The whole stored document is rendered verbatim: its version, its
    // submitted status, and the loadsByReportingPeriod breakdown the page
    // exists to surface - open and closed period loads, their balance-affecting
    // tonnage deltas, and the closed periods.
    const document = await summaryLogDocumentPage.getDocument()
    expect(document.version).toBeDefined()
    expect(document.status).toBe('submitted')

    const loads = document.loadsByReportingPeriod
    expect(loads).toMatchObject({
      openPeriodLoads: {
        added: { balanceAffecting: { count: expect.any(Number) } }
      },
      closedPeriodLoads: {
        added: { balanceAffecting: { count: expect.any(Number) } }
      },
      closedPeriods: expect.any(Array)
    })
    expect(
      loads.openPeriodLoads.added.balanceAffecting.tonnageDelta
    ).toBeGreaterThan(0)
  })

  test('An unknown summary log id falls through to the standard Page not found @summaryLogDocument', async ({
    page
  }) => {
    await openRegistrationOverview(page)

    // The registration overview URL shares the summary-log URL's prefix; swap
    // /overview for an unknown log so the backend 404 propagates to the
    // standard not-found page rather than a 500. Assert the suffix first so a
    // future route change fails here, not confusingly as a 200 later.
    const overviewUrl = page.url()
    expect(overviewUrl).toMatch(/\/overview$/)
    const notFoundUrl = overviewUrl.replace(
      /\/overview$/,
      '/summary-logs/unknown-summary-log-id'
    )

    const response = await page.goto(notFoundUrl)

    expect(response?.status()).toEqual(404)
    const body = await page.textContent('body')
    expect(body).toContain('Page not found')
  })
})
