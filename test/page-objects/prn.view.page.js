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

  // The only govuk-button on the page carrying the warning modifier -
  // deletePRNButton is a plain govuk-button, so this class alone identifies
  // it without depending on note-type-specific button text.
  cancelPRNButton() {
    return this.page.locator('a.govuk-button--warning')
  }

  deletePRNButton() {
    return this.page.locator('.govuk-button-group a.govuk-button')
  }

  issuePRNButton() {
    return this.page.locator('.govuk-button-group button.govuk-button')
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
