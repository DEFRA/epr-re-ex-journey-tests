import { test, expect } from '@playwright/test'

import { HomePage } from 'page-objects/admin/home.page'
import { JsonEditor } from 'page-objects/admin/jsoneditor.page'
import { AdminLoginPage } from 'page-objects/admin/login.page'
import { Navigation } from 'page-objects/admin/navigation.page'
import { OrganisationsPage } from 'page-objects/admin/organisations.page'
import { SystemLogsPage } from 'page-objects/admin/system.logs.page'
import { createLinkedOrganisation } from '../../support/seeding/organisation.js'
import { checkAccessibility } from '../../support/accessibility.js'
test.describe('System logs search @searchSystemLogs', () => {
  let linkedOrganisation
  const updatedOrgId = () => Number(linkedOrganisation.orgId) + 100000

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

    page = await (await browser.newContext()).newPage()

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
    await jsonEditor.updateOrgId(updatedOrgId())
    await jsonEditor.saveButton().click()

    const successMessage = await organisationsPage.getSuccessMessage()
    expect(successMessage).toEqual('Organisation record updated')
  })

  test.afterAll(async () => {
    await page.context().close()
  })

  test('shows no results when user ID matches no logs', async () => {
    const navigation = new Navigation(page)
    const systemLogsPage = new SystemLogsPage(page)

    await navigation.clickOnLink('System logs')
    await checkAccessibility(page, 'System logs')

    await systemLogsPage.searchByUserId('no-such-user-id')
    await expect(
      page.locator('#main-content div.govuk-summary-card')
    ).toHaveCount(0)
  })

  test('clears search and resets the form', async () => {
    const navigation = new Navigation(page)
    const systemLogsPage = new SystemLogsPage(page)

    await navigation.clickOnLink('System logs')
    await systemLogsPage.searchFor(updatedOrgId())
    const userId = await systemLogsPage.firstResultUserId()

    await navigation.clickOnLink('System logs')
    await systemLogsPage.searchByAllFilters(
      updatedOrgId(),
      userId,
      'epr-organisations'
    )
    await expect(
      page.locator('#main-content div.govuk-summary-card')
    ).not.toHaveCount(0)

    await systemLogsPage.clearSearchLink().click()

    expect(await systemLogsPage.organisationNumberValue()).toBe('')
    expect(await systemLogsPage.userIdValue()).toBe('')
    expect(await systemLogsPage.eventTypeValue()).toBe('')
    await expect(
      page.locator('#main-content div.govuk-summary-card')
    ).toHaveCount(0)
  })
})
