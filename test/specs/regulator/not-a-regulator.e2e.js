import { randomUUID } from 'node:crypto'
import { test, expect } from '@playwright/test'

import { RegulatorLoginPage } from 'page-objects/regulator/login.page'
import { NotAuthorisedPage } from 'page-objects/regulator/not-authorised.page'

test.describe('An Entra user who is not a regulator @regulator', () => {
  test('is turned away at sign in, and reaches no operator page afterwards @notARegulator', async ({
    page
  }) => {
    const loginPage = new RegulatorLoginPage(page)
    const notAuthorisedPage = new NotAuthorisedPage(page)

    await loginPage.loginAsUnrecognisedUser()

    // Sign-in is the one point that establishes that an identity holds no role
    // this service knows, so this is the one refusal entitled to say why. The
    // body is matched on the instruction rather than the whole sentence: the
    // reader must be told how to ask for access, and a content designer must
    // be free to reword the rest without turning this journey red.
    expect(await notAuthorisedPage.getHeadingText()).toBe(
      'You do not have access to this service'
    )
    expect(await notAuthorisedPage.getBodyText()).toContain(
      'To ask for access, contact us'
    )
    expect(await notAuthorisedPage.getBodyText()).not.toMatch(/entra/i)

    // Authenticating and being refused is the easy half. The failure mode is a
    // half-session that lets the user wander, so prove no session was left
    // behind: an operator page sends a signed-out visitor away.
    await page.goto(`/organisations/${randomUUID()}`)
    await expect(page).toHaveTitle(/Signed out/)
  })
})
