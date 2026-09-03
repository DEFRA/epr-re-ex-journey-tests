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
   * Every route this page offers, with the ids taken out of the paths. A
   * journey compares the whole set rather than looking for one link, so a
   * route added here later has to be justified: the discard link and the
   * return link are both anchors, and only one of them belongs to a reader.
   *
   * @returns {Promise<string[]>}
   */
  async offeredRoutes() {
    const hrefs = await this.page
      .locator('#main-content a[href]')
      .evaluateAll((links) => links.map((link) => link.getAttribute('href')))

    return hrefs.map((href) => href.replace(/[0-9a-f]{24}/g, '{id}')).sort()
  }

  /**
   * The issue button posts back to this page, so it carries no href of its own
   * and the routes above cannot see it. Its form is what says it is there.
   *
   * @returns {Promise<number>}
   */
  async formCount() {
    return this.page.locator('#main-content form').count()
  }
}

export { PRNViewPage }
