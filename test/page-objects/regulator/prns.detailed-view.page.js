import { PRNDashboardPage } from 'page-objects/prn.dashboard.page'

/**
 * The regulator's view of an accreditation's notes. The tabs and tables are the
 * operator's, so those are inherited; only the page furniture differs.
 */
class PrnsDetailedViewPage extends PRNDashboardPage {
  /**
   * The page itself, so a journey can tell it from the operator's list.
   * @returns {import('@playwright/test').Locator}
   */
  detailedView() {
    return this.page.locator('#main-content [data-testid="prns-detailed-view"]')
  }

  /**
   * The caption's size is the design's to choose, so any size is read.
   * @returns {Promise<string>}
   */
  async captionText() {
    return this.page.locator('h1 [class^="govuk-caption-"]').innerText()
  }

  /**
   * @returns {Promise<string[]>}
   */
  async breadcrumbs() {
    const texts = await this.page
      .locator('.govuk-breadcrumbs__list-item')
      .allInnerTexts()

    return texts.map((text) => text.trim())
  }

  /**
   * @returns {Promise<number>}
   */
  async changeControlCount() {
    return this.page.locator('#main-content button, #main-content form').count()
  }
}

export { PrnsDetailedViewPage }
