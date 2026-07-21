import HomePage from 'page-objects/homepage.js'
import { browser } from '@wdio/globals'

import AxeBuilder from '@axe-core/webdriverio'
import { logViolationsToAllure } from '../support/accessibility.js'

function failOnViolationLevel(results) {
  results.violations.forEach((violation) => {
    if (violation.impact === 'critical' || violation.impact === 'serious') {
      throw new Error(
        'At least one Serious or Critical accessibility violation found'
      )
    }
  })
}

describe('WCAG Accessibility', () => {
  it('Should have no critical accessibility violations for Home Page', async () => {
    await HomePage.open()

    const builder = new AxeBuilder({ client: browser })
    const results = await builder.analyze()
    await logViolationsToAllure(results.violations)
    failOnViolationLevel(results)
  })
})
