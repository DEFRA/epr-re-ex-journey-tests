import { expect } from '@playwright/test'
import { Page } from 'page-objects/page'

class CheckBeforeCreatingPRNPage extends Page {
  async headingText() {
    const element = this.page.locator('h1.govuk-heading-xl')
    await expect
      .poll(() => element.innerText(), { timeout: 10000 })
      .toContain('Check before')
    return element.innerText()
  }

  createPRNButton() {
    return this.page.locator('#main-content button[type=submit]')
  }

  discardAndStartAgainLink() {
    return this.page.locator('a', {
      hasText: /^\s*Discard and start again\s*$/
    })
  }
}

export { CheckBeforeCreatingPRNPage }
