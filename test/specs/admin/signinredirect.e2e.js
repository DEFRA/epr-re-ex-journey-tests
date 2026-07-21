import { $, browser, expect } from '@wdio/globals'

import LoginPage from 'page-objects/admin/login.page'
import OrganisationsPage from 'page-objects/admin/organisations.page'

describe('Signin redirect tests @signinredirect', () => {
  it('Should be redirected to the originally requested page and not redirected to the home page', async () => {
    await OrganisationsPage.open()
    await expect(browser).toHaveTitle(expect.stringContaining('Organisations'))

    await $('=Sign in').click()

    await LoginPage.enterCredentials('ea@test.gov.uk', 'pass')
    await LoginPage.submitCredentials()

    const orgTableHeader = await OrganisationsPage.getHeaderText()
    expect(orgTableHeader).toBe('All organisations')

    await expect($('body')).not.toHaveText(
      expect.stringContaining('This is the home page.')
    )
  })
})
