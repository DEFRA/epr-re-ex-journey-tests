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

  async createPRN() {
    await this.page.locator('#main-content button[type=submit]').click()
  }

  async discardAndStartAgain() {
    await this.page
      .getByRole('link', { name: 'Discard and start again', exact: true })
      .click()
  }
}

export { CheckBeforeCreatingPRNPage }
