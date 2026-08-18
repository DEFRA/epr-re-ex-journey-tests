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
