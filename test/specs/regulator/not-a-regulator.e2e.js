import { randomUUID } from 'node:crypto'
import { test, expect } from '@playwright/test'

import { RegulatorLoginPage } from 'page-objects/regulator/login.page'
import { NotAuthorisedPage } from 'page-objects/regulator/not-authorised.page'

test.describe('An Entra user who is not a regulator @regulator', () => {
  test('is turned away at sign in, and reaches no operator page afterwards @notaregulator', async ({
    page
  }) => {
    const loginPage = new RegulatorLoginPage(page)
    const notAuthorisedPage = new NotAuthorisedPage(page)

    await loginPage.loginAsUnrecognisedUser()

    // The sign-in refusal states a cause, because the callback establishes one:
    // this identity holds no role the service knows. That is a different page
    // from the refusal a signed-in user meets, which knows only that the
    // backend answered 403.
    expect(await notAuthorisedPage.getHeadingText()).toBe('User not authorised')
    expect(await notAuthorisedPage.getBodyText()).toContain(
      'This Entra user is not configured as a regulator'
    )

    // Authenticating and being refused is the easy half. The failure mode is a
    // half-session that lets the user wander, so prove no session was left
    // behind: an operator page sends a signed-out visitor away.
    await page.goto(`/organisations/${randomUUID()}`)
    await expect(page).toHaveTitle(/Signed out/)
  })
})
