import { test, expect } from '@playwright/test'

import { HomePage } from 'page-objects/admin/home.page'
import { JsonEditor } from 'page-objects/admin/jsoneditor.page'
import { AdminLoginPage } from 'page-objects/admin/login.page'
import { Navigation } from 'page-objects/admin/navigation.page'
import { OrganisationsPage } from 'page-objects/admin/organisations.page'
import { SystemLogsPage } from 'page-objects/admin/system.logs.page'
import { createLinkedOrganisation } from '../../support/apicalls.js'

test.describe('System logs search @searchsystemlogs', () => {
  let linkedOrganisation

  test.beforeAll(async () => {
    linkedOrganisation = await createLinkedOrganisation([
      { material: 'Paper or board (R3)', wasteProcessingType: 'Reprocessor' }
    ])
  })

  // Playwright isolates every test in its own browser context, so the
  // WDIO-era shared-session setup (log in once, bump the org's ID once) has
  // to re-run per test here instead of once in a describe-level `before`.
  // Re-running the org-ID bump is a no-op past the first test (it targets
  // the same already-bumped value each time).
  test.beforeEach(async ({ page }) => {
    const loginPage = new AdminLoginPage(page)
    const homePage = new HomePage(page)
    const navigation = new Navigation(page)
    const organisationsPage = new OrganisationsPage(page)
    const jsonEditor = new JsonEditor(page)

    await loginPage.loginAsServiceMaintainer()

    const headerText = await homePage.getWelcomeText()
    expect(headerText).toEqual('Welcome EA Regulator!')

    await navigation.clickOnLink('Organisations')
    await organisationsPage.searchFor(
      linkedOrganisation.organisation.companyName
    )
    expect(await organisationsPage.searchResult()).toEqual('1 result found')
    await organisationsPage.editLink(1)
    await jsonEditor.switchToTreeEditor()
    await jsonEditor.updateOrgId(Number(linkedOrganisation.orgId) + 100000)
    await jsonEditor.saveChanges()

    const successMessage = await organisationsPage.getSuccessMessage()
    expect(successMessage).toEqual('Organisation record updated')
  })

  test('finds system logs by organisation reference number', async ({
    page
  }) => {
    const navigation = new Navigation(page)
    const systemLogsPage = new SystemLogsPage(page)

    await navigation.clickOnLink('System logs')

    await systemLogsPage.searchFor(linkedOrganisation.refNo)
    await expect(
      page.locator('#main-content div.govuk-summary-card')
    ).not.toHaveCount(0)
  })

  test('finds system logs by user ID', async ({ page }) => {
    const navigation = new Navigation(page)
    const systemLogsPage = new SystemLogsPage(page)

    await navigation.clickOnLink('System logs')
    await systemLogsPage.searchFor(linkedOrganisation.refNo)
    const userId = await systemLogsPage.firstResultUserId()

    await navigation.clickOnLink('System logs')
    await systemLogsPage.searchByUserId(userId)
    await expect(
      page.locator('#main-content div.govuk-summary-card')
    ).not.toHaveCount(0)
  })

  test('shows no results when user ID matches no logs', async ({ page }) => {
    const navigation = new Navigation(page)
    const systemLogsPage = new SystemLogsPage(page)

    await navigation.clickOnLink('System logs')

    await systemLogsPage.searchByUserId('no-such-user-id')
    await expect(
      page.locator('#main-content div.govuk-summary-card')
    ).toHaveCount(0)
  })

  test('filters by event type alongside user ID', async ({ page }) => {
    const navigation = new Navigation(page)
    const systemLogsPage = new SystemLogsPage(page)

    await navigation.clickOnLink('System logs')
    await systemLogsPage.searchFor(linkedOrganisation.refNo)
    const userId = await systemLogsPage.firstResultUserId()

    await navigation.clickOnLink('System logs')
    await systemLogsPage.searchByUserIdAndEventType(userId, 'epr-organisations')
    await expect(
      page.locator('#main-content div.govuk-summary-card')
    ).not.toHaveCount(0)
  })

  test('clears search and resets the form', async ({ page }) => {
    const navigation = new Navigation(page)
    const systemLogsPage = new SystemLogsPage(page)

    await navigation.clickOnLink('System logs')
    await systemLogsPage.searchFor(linkedOrganisation.refNo)
    const userId = await systemLogsPage.firstResultUserId()

    await navigation.clickOnLink('System logs')
    await systemLogsPage.searchByAllFilters(
      linkedOrganisation.refNo,
      userId,
      'epr-organisations'
    )
    await expect(
      page.locator('#main-content div.govuk-summary-card')
    ).not.toHaveCount(0)

    await systemLogsPage.clearSearch()

    expect(await systemLogsPage.referenceNumberValue()).toBe('')
    expect(await systemLogsPage.userIdValue()).toBe('')
    expect(await systemLogsPage.eventTypeValue()).toBe('')
    await expect(
      page.locator('#main-content div.govuk-summary-card')
    ).toHaveCount(0)
  })

  test('shows error when submitting with no filters', async ({ page }) => {
    const navigation = new Navigation(page)
    const systemLogsPage = new SystemLogsPage(page)

    await navigation.clickOnLink('System logs')
    await systemLogsPage.submitSearch()

    await expect(page.locator('.govuk-error-summary')).toHaveText(
      /Enter an organisation reference number, user ID or event type/
    )
  })
})
