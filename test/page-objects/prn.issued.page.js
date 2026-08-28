import { Page } from 'page-objects/page'

class PRNIssuedPage extends Page {
  async prnNumberText() {
    return this.panelDetailText()
  }

  issueAnotherPRN() {
    return this.page.getByRole('link', {
      name: /^Issue another (PRN|PERN)$/
    })
  }

  managePRNs() {
    return this.page.getByRole('link', { name: /^Manage (PRNs|PERNs)$/ })
  }

  viewPdfButton() {
    return this.page.locator('a.govuk-button--secondary')
  }
}

export { PRNIssuedPage }
