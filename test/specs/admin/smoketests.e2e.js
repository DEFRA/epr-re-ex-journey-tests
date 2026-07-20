import { browser, expect } from '@wdio/globals'

import HomePage from 'page-objects/admin/home.page'
import LoginPage from 'page-objects/admin/login.page'
import Navigation from 'page-objects/admin/navigation.page'
import OrganisationsPage from 'page-objects/admin/organisations.page'
import PublicRegisterPage from 'page-objects/admin/public.register.page'
import SystemLogsPage from 'page-objects/admin/system.logs.page'
import config from '../../config/config.js'
import TonnageMonitoringPage from 'page-objects/admin/tonnage.monitoring.page'

describe('Smoke tests @smoketest', () => {
  it('Should be to login and view Home Page and Organisations Page', async () => {
    // Increase timeout for Smoke tests for slow loading pages like Organisation page
    await browser.setTimeout({ pageLoad: 60000 })

    await HomePage.open()
    await expect(browser).toHaveTitle(expect.stringContaining('Home'))

    await LoginPage.open()
    await LoginPage.enterCredentialsMSLogin(
      config.auth.username,
      config.auth.password
    )

    const headerText = await browser.$('main h1').getText()
    expect(headerText).toEqual('Welcome ServiceMaintainer TestUser (Defra)!')

    await Navigation.clickOnLink('Organisations')
    const orgTableHeader = await OrganisationsPage.getHeaderText()
    expect(orgTableHeader).toBe('All organisations')

    await Navigation.clickOnLink('System logs')
    const actualNoSystemLogsFoundText = await SystemLogsPage.noSystemLogsFound()
    expect(actualNoSystemLogsFoundText).toEqual('No system logs found')

    await Navigation.clickOnLink('Public register')
    await PublicRegisterPage.downloadPublicRegister()

    await Navigation.clickOnLink('Tonnage monitoring')
    await TonnageMonitoringPage.downloadCsv()
  })
})
