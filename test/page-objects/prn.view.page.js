import { Page } from 'page-objects/page'

class PRNViewPage extends Page {
  returnToPRNList() {
    return this.page.getByRole('link', {
      name: 'Return to PRN list',
      exact: true
    })
  }

  returnToPERNList() {
    return this.page.getByRole('link', {
      name: 'Return to PERN list',
      exact: true
    })
  }

  cancelPRNButton() {
    return this.page.getByRole('button', { name: /^Cancel (PRN|PERN)$/ })
  }

  deletePRNButton() {
    return this.page.locator('.govuk-button-group a.govuk-button')
  }

  // Name-matched rather than selected by class: the cookie-consent banner's
  // Accept/Reject buttons also render as a .govuk-button-group of plain
  // govuk-buttons, so a class-only locator is ambiguous once that banner is
  // showing.
  issuePRNButton() {
    return this.page.getByRole('button', { name: /^Issue (PRN|PERN)$/ })
  }

  async issueAndCheckDoubleClickPrevented() {
    await this.submitAndCheckDoubleClickPrevented(this.issuePRNButton())
  }

  /**
   * The issue button posts back to this page, so its form is what says it is
   * there.
   *
   * @returns {Promise<number>}
   */
  async formCount() {
    return this.page.locator('#main-content form').count()
  }
}

export { PRNViewPage }
