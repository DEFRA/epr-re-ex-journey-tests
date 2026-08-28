import { test, expect } from '@playwright/test'

import { HomePage } from 'page-objects/admin/home.page'
import { JsonEditor } from 'page-objects/admin/jsoneditor.page'
import { AdminLoginPage } from 'page-objects/admin/login.page'
import { Navigation } from 'page-objects/admin/navigation.page'
import { OrganisationsPage } from 'page-objects/admin/organisations.page'
import { SystemLogsPage } from 'page-objects/admin/system.logs.page'
import { createLinkedOrganisation } from '../../support/organisation-seeding.js'
test.describe('System logs search @searchsystemlogs', () => {
  let linkedOrganisation

  // All tests below share one continuous, already-logged-in session: the
  // org-ID bump only needs to happen once to produce a searchable system-log
  // entry, so it's done once here rather than re-walked through the UI per
  // test. A dedicated Page is created via the `browser` fixture since `page`
  // isn't available in beforeAll/afterAll.
  /** @type {import('@playwright/test').Page} */
  let page

  test.beforeAll(async ({ browser }) => {
    linkedOrganisation = await createLinkedOrganisation([
      { material: 'Paper or board (R3)', wasteProcessingType: 'Reprocessor' }
    ])

    page = await browser.newPage()

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

  test.afterAll(async () => {
    await page.close()
  })

  test('finds system logs by organisation reference number', async () => {
    const navigation = new Navigation(page)
    const systemLogsPage = new SystemLogsPage(page)

    await navigation.clickOnLink('System logs')

    await systemLogsPage.searchFor(linkedOrganisation.refNo)
    await expect(
      page.locator('#main-content div.govuk-summary-card')
    ).not.toHaveCount(0)
  })

  test('finds system logs by user ID', async () => {
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

  test('shows no results when user ID matches no logs', async () => {
    const navigation = new Navigation(page)
    const systemLogsPage = new SystemLogsPage(page)

    await navigation.clickOnLink('System logs')

    await systemLogsPage.searchByUserId('no-such-user-id')
    await expect(
      page.locator('#main-content div.govuk-summary-card')
    ).toHaveCount(0)
  })

  test('filters by event type alongside user ID', async () => {
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

  test('clears search and resets the form', async () => {
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

  test('shows error when submitting with no filters', async () => {
    const navigation = new Navigation(page)
    const systemLogsPage = new SystemLogsPage(page)

    await navigation.clickOnLink('System logs')
    await systemLogsPage.submitSearch()

    await expect(page.locator('.govuk-error-summary')).toHaveText(
      /Enter an organisation reference number, user ID or event type/
    )
  })
})
