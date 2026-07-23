import { test, expect } from '@playwright/test'

import { AdminLoginPage } from 'page-objects/admin/login.page'
import { OrganisationsPage } from 'page-objects/admin/organisations.page'

test.describe('Signin redirect tests @signinredirect', () => {
  test('Should be redirected to the originally requested page and not redirected to the home page', async ({
    page
  }) => {
    const loginPage = new AdminLoginPage(page)
    const organisationsPage = new OrganisationsPage(page)

    await organisationsPage.open()
    await expect(page).toHaveTitle(/Organisations/)

    await page.getByRole('link', { name: 'Sign in', exact: true }).click()

    await loginPage.enterCredentials('ea@test.gov.uk', 'pass')
    await loginPage.submitCredentials()

    const orgTableHeader = await organisationsPage.getHeaderText()
    expect(orgTableHeader).toBe('All organisations')

    await expect(page.locator('body')).not.toHaveText(/This is the home page\./)
  })
})
