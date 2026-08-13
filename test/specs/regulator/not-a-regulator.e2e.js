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

    // The refusal page's wording changes with the authorisation work, and the
    // regulator-cannot-change journey asserts the new wording against the
    // branch that introduces it. What holds either side of that change is that
    // this user does not reach the regulators area.
    expect(await notAuthorisedPage.getHeadingText()).not.toBe('Regulators home')

    // Authenticating and being refused is the easy half. The failure mode is a
    // half-session that lets the user wander, so prove no session was left
    // behind: an operator page sends a signed-out visitor away.
    await page.goto(`/organisations/${randomUUID()}`)
    await expect(page).toHaveTitle(/Signed out/)
  })
})
