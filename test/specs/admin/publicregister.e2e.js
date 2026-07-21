import { browser, expect } from '@wdio/globals'

import LoginPage from 'page-objects/admin/login.page'
import Navigation from 'page-objects/admin/navigation.page'
import PublicRegisterPage from 'page-objects/admin/public.register.page'

describe('Public Register page', () => {
  it('Should be able to view Public Register if logged in @publicregister', async () => {
    await LoginPage.open()
    await expect(browser).toHaveTitle(expect.stringContaining('Login'))
    await LoginPage.enterCredentials('ea@test.gov.uk', 'pass')
    await LoginPage.submitCredentials()

    await Navigation.clickOnLink('Public register')
    expect(
      await PublicRegisterPage.downloadPublicRegisterButtonExistence()
    ).toBe(true)
    await PublicRegisterPage.downloadPublicRegister()
  })
})
