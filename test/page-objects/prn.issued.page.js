import { Page } from 'page-objects/page'

class PRNIssuedPage extends Page {
  async prnNumberText() {
    return this.panelDetailText()
  }

  issueAnotherPRN() {
    return this.page.locator('#main-content > div > div > p:nth-child(4) > a')
  }

  managePRNs() {
    return this.page.locator('#main-content > div > div > p:nth-child(5) > a')
  }

  async viewPdfButton() {
    await this.page
      .locator('#main-content > div > div > p:nth-child(3) > a')
      .click()
  }
}

export { PRNIssuedPage }
