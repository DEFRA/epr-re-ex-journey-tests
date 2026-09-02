import { test, expect } from '@playwright/test'

import { NoPermissionPage } from 'page-objects/no-permission.page'
import { RegulatorLoginPage } from 'page-objects/regulator/login.page'

/**
 * Reads the cross-site request token the service issued to this browser. A
 * write submitted without it is refused for cross-site protection instead, and
 * from outside the two refusals look the same - so a journey that skips this
 * passes while never reaching the control it claims to test.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string>}
 */
async function readRequestToken(page) {
  const cookie = (await page.context().cookies()).find(
    ({ name }) => name === 'crumb'
  )

  if (!cookie) {
    throw new Error(
      'The service issued no crumb cookie, so this journey cannot tell a regulator refusal from a cross-site refusal.'
    )
  }

  return cookie.value
}

test.describe('A regulator who tries to change operator data @regulator', () => {
  test('is told they do not have permission @regulatorCannotChange', async ({
    page
  }) => {
    const loginPage = new RegulatorLoginPage(page)
    const refusalPage = new NoPermissionPage(page)

    await loginPage.loginAsRegulator()

    const requestToken = await readRequestToken(page)

    // Submitting a real form is how an operator reaches this route, and the
    // browser must make the request for the session to travel with it. The
    // operator page that carries the form does not render for a regulator, so
    // the form is built in the page they do reach.
    await page.evaluate(
      ({ action, token }) => {
        const form = document.createElement('form')
        form.method = 'POST'
        form.action = action

        const field = document.createElement('input')
        field.name = 'crumb'
        field.value = token
        form.appendChild(field)

        document.body.appendChild(form)
        form.submit()
      },
      { action: '/account/linking', token: requestToken }
    )

    await page.waitForLoadState()

    expect(await refusalPage.getHeadingText()).toBe(
      'You do not have permission'
    )
    expect(await refusalPage.getBodyText()).toContain(
      'You cannot use the page you asked for'
    )
  })
})
