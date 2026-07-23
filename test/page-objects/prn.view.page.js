import { Page } from 'page-objects/page'

const ISSUE_BUTTON_SELECTOR = '#main-content > div > div > form > div > button'

class PRNViewPage extends Page {
  async returnToPRNList() {
    await this.page.locator('a', { hasText: 'Return to PRN list' }).click()
  }

  async returnToPERNList() {
    await this.page.locator('a', { hasText: 'Return to PERN list' }).click()
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
    await this.submit(ISSUE_BUTTON_SELECTOR)
  }

  async issueAndCheckDoubleClickPrevented() {
    await this.submitAndCheckDoubleClickPrevented(ISSUE_BUTTON_SELECTOR)
  }
}

export { PRNViewPage }
