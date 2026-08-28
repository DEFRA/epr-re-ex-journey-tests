import { test, expect } from '@playwright/test'

import { NoPermissionPage } from 'page-objects/no-permission.page'
import { ServiceNavigation } from 'page-objects/service-navigation.page'
import {
  createLinkedOrganisation,
  updateMigratedOrganisation
} from '~/test/support/organisation-seeding.js'
import { createLinkAndLogin } from '~/test/support/login-helper.js'

test.describe('An operator at the regulator door @regulator', () => {
  // Welsh is checked alongside English because every route in the service is
  // doubled under a /cy prefix. A guard that holds on one prefix and not the
  // other is a way in, and nothing else in the suite looks for it.
  for (const prefix of ['', '/cy']) {
    test(`cannot open the regulators area at ${prefix || '/'} @operatoratregulatordoor`, async ({
      page
    }) => {
      // The journey needs nothing of the operator but a signed-in session, so
      // the organisation is seeded as small as one can be.
      const { refNo } = await createLinkedOrganisation([
        {
          material: 'Paper or board (R3)',
          wasteProcessingType: 'Reprocessor',
          withoutAccreditation: true
        }
      ])

      // An operator only reaches the service once their organisation is
      // approved. Until then the backend refuses to link their Defra ID user,
      // so the seeding has to take the organisation to that state.
      const { email } = await updateMigratedOrganisation(refNo, [
        {
          regNumber: 'R25SR500060912PA',
          status: 'approved',
          reprocessingType: 'input',
          withoutAccreditation: true
        }
      ])

      const refusalPage = new NoPermissionPage(page)
      const serviceNavigation = new ServiceNavigation(page)

      await createLinkAndLogin(page, refNo, email)

      await page.goto(`${prefix}/regulators/home`)

      await expect(page.locator('main h1')).not.toHaveText('Organisations')
      expect(await refusalPage.getHeadingText()).toBe(
        'You do not have permission'
      )
      expect(await refusalPage.getBodyText()).toContain(
        'You cannot use the page you asked for'
      )

      // The operator keeps the operator shell at a regulator address, because
      // the role decides which shell renders and the route never does.
      expect(await serviceNavigation.serviceName()).toBe(
        'Record reprocessed or exported packaging waste'
      )
      expect(await serviceNavigation.serviceUrl()).toBe(`${prefix}/start`)
      expect(await serviceNavigation.linkTexts()).toEqual([
        'Home',
        'Manage account',
        'Sign out'
      ])
    })
  }
})
