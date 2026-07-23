import { test } from '@playwright/test'
import { HomePage } from 'page-objects/admin/home.page'

import AxeBuilder from '@axe-core/playwright'
import { logViolationsToAllure } from '../../support/accessibility.js'

function failOnViolationLevel(results) {
  results.violations.forEach((violation) => {
    if (violation.impact === 'critical' || violation.impact === 'serious') {
      throw new Error(
        'At least one Serious or Critical accessibility violation found'
      )
    }
  })
}

test.describe('WCAG Accessibility', () => {
  test('Should have no critical accessibility violations for Home Page @smoketest', async ({
    page
  }) => {
    const homePage = new HomePage(page)
    await homePage.open()

    const builder = new AxeBuilder({ page })
    const results = await builder.analyze()
    await logViolationsToAllure(results.violations)
    failOnViolationLevel(results)
  })
})
