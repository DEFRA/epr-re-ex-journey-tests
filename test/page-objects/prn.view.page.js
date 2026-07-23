import { Page } from 'page-objects/page'
import { checkDoubleClickPrevented } from '../support/double-click.js'

class PRNViewPage extends Page {
  async headingText() {
    return this.page.locator('h1.govuk-heading-xl').innerText()
  }

  async returnToPRNList() {
    await this.page.getByRole('link', { name: 'Return to PRN list' }).click()
  }

  async returnToPERNList() {
    await this.page.getByRole('link', { name: 'Return to PERN list' }).click()
  }

  async cancelPRNButton() {
    await this.page.locator('#main-content > div > div > a').click()
  }

  async deletePRNButton() {
    await this.page
      .locator('#main-content > div > div > form > div > a')
      .click()
  }

  async issuePRNButton() {
    await this.page
      .locator('#main-content > div > div > form > div > button')
      .click()
  }

  async issueAndCheckDoubleClickPrevented() {
    await checkDoubleClickPrevented(
      this.page,
      '#main-content > div > div > form > div > button'
    )
  }
}

export { PRNViewPage }
