import { test, expect } from '@playwright/test'

import { createLinkedOrganisation } from '~/test/support/apicalls.js'
import { createLinkAndLogin } from '~/test/support/login-helper.js'
import { requireValue } from '~/test/support/required-value.js'

test.describe('An operator at the regulator door @regulator', () => {
  // Welsh is checked alongside English because every route in the service is
  // doubled under a /cy prefix. A guard that holds on one prefix and not the
  // other is a way in, and nothing else in the suite looks for it.
  for (const prefix of ['', '/cy']) {
    test(`cannot open the regulators area at ${prefix || '/'} @operatoratregulatordoor`, async ({
      page
    }) => {
      const { refNo, organisation } = await createLinkedOrganisation([
        { material: 'Paper or board (R3)', wasteProcessingType: 'Reprocessor' }
      ])

      await createLinkAndLogin(
        page,
        refNo,
        requireValue(organisation.email, 'EMAIL_ADDRESS')
      )

      await page.goto(`${prefix}/regulators/home`)

      await expect(page.locator('main h1')).not.toHaveText('Regulators home')
      await expect(page.locator('main')).toContainText('Forbidden')
    })
  }
})
