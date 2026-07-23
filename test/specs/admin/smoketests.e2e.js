import { test, expect } from '@playwright/test'

import { HomePage } from 'page-objects/admin/home.page'
import { AdminLoginPage } from 'page-objects/admin/login.page'
import { Navigation } from 'page-objects/admin/navigation.page'
import { OrganisationsPage } from 'page-objects/admin/organisations.page'
import { PublicRegisterPage } from 'page-objects/admin/public.register.page'
import { SystemLogsPage } from 'page-objects/admin/system.logs.page'
import config from '../../config/config.js'
import { TonnageMonitoringPage } from 'page-objects/admin/tonnage.monitoring.page'

// @envonly: signs in via the real Microsoft/Entra login form
// (AdminLoginPage.enterCredentialsMSLogin), which only exists when the admin
// app is wired to the real Entra IdP (CDP test environment). Locally/GHA the
// stack uses epr-re-ex-entra-stub instead, which never renders that form -
// so this spec must be excluded from local/GHA runs regardless of @smoketest.
test.describe('Admin UI Smoke tests @smoketest @envonly', () => {
  test('Should be to login and view Admin UI related pages', async ({
    page
  }) => {
    const homePage = new HomePage(page)
    const loginPage = new AdminLoginPage(page)
    const navigation = new Navigation(page)
    const organisationsPage = new OrganisationsPage(page)
    const publicRegisterPage = new PublicRegisterPage(page)
    const systemLogsPage = new SystemLogsPage(page)
    const tonnageMonitoringPage = new TonnageMonitoringPage(page)

    // Increase timeout for Smoke tests for slow loading pages like Organisation page
    page.setDefaultNavigationTimeout(60000)

    await homePage.open()
    await expect(page).toHaveTitle(/Home/)

    await loginPage.open()
    await loginPage.enterCredentialsMSLogin(
      config.auth.username,
      config.auth.password
    )

    const headerText = await homePage.getWelcomeText()
    expect(headerText).toEqual('Welcome ServiceMaintainer TestUser (Defra)!')

    await navigation.clickOnLink('Organisations')
    const orgTableHeader = await organisationsPage.getHeaderText()
    expect(orgTableHeader).toBe('All organisations')

    await navigation.clickOnLink('System logs')
    const actualNoSystemLogsFoundText = await systemLogsPage.noSystemLogsFound()
    expect(actualNoSystemLogsFoundText).toEqual('No system logs found')

    await navigation.clickOnLink('Public register')
    await publicRegisterPage.downloadPublicRegister()

    await navigation.clickOnLink('Tonnage monitoring')
    await tonnageMonitoringPage.downloadCsv()
  })
})
