import { test, expect } from '@playwright/test'
import {
  createLinkedOrganisation,
  updateMigratedOrganisation,
  FAKE_REGISTRATION_NUMBER
} from '../support/seeding/organisation.js'
import { createLinkAndLogin } from '../support/login-helper.js'

/**
 * @import { Page } from '@playwright/test'
 */

/**
 * What the page has told the measurement library, and what the browser would
 * have told it unaided. The second is the control: a check driven by direct
 * navigation carries no referrer at all and passes whether the identifier is
 * being sent or not.
 * @param {Page} page
 */
const reportedBy = (page) =>
  page.evaluate(() => {
    const queue = /** @type {IArguments[]} */ (
      Reflect.get(window, 'dataLayer') ?? []
    )
    const config = queue.find((entry) => entry[0] === 'config')

    return {
      cameFromInTheBrowser: document.referrer,
      parameters: config ? config[2] : null
    }
  })

/**
 * @param {Page} page
 */
const acceptAnalyticsCookies = async (page) => {
  await page.goto('/start')
  await page.getByRole('button', { name: 'Accept analytics cookies' }).click()
}

const setupReprocessor = async (page) => {
  const organisationDetails = await createLinkedOrganisation([
    {
      material: 'Paper or board (R3)',
      wasteProcessingType: 'Reprocessor',
      withoutAccreditation: true
    }
  ])

  const migrationResponse = await updateMigratedOrganisation(
    organisationDetails.refNo,
    [
      {
        reprocessingType: 'output',
        regNumber: FAKE_REGISTRATION_NUMBER,
        status: 'approved',
        withoutAccreditation: true
      }
    ]
  )

  await createLinkAndLogin(
    page,
    organisationDetails.refNo,
    migrationResponse.email
  )

  return organisationDetails
}

test.describe('Analytics reporting @analytics', () => {
  test('Should report the step the visitor came from, not the address', async ({
    page
  }) => {
    await acceptAnalyticsCookies(page)
    await setupReprocessor(page)

    await page.waitForURL(/\/organisations\/[0-9a-f]{24}$/)
    const organisationUrl = page.url()

    await page.getByRole('link', { name: 'Cookies', exact: true }).click()

    const { cameFromInTheBrowser, parameters } = await reportedBy(page)
    const { origin } = new URL(organisationUrl)

    expect(cameFromInTheBrowser).toBe(organisationUrl)
    expect(parameters).toStrictEqual({
      page_location: `${origin}/cookies`,
      page_referrer: `${origin}/organisations/:organisationId`
    })
  })
})
