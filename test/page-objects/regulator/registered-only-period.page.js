import { Page } from 'page-objects/page'

class RegisteredOnlyPeriodPage extends Page {
  /**
   * The caption's size is the design's to choose, so any size is read.
   * @returns {Promise<string>}
   */
  async captionText() {
    return this.page.locator('h1 [class^="govuk-caption-"]').innerText()
  }

  /**
   * Shown only where the year holds no registered-only time at all.
   * @returns {import('@playwright/test').Locator}
   */
  noDataMessage() {
    return this.page.locator('[data-testid="no-data"]')
  }

  /**
   * The second half of the empty state, pointing a reader back rather than
   * linking them - the design renders it as plain text.
   * @returns {import('@playwright/test').Locator}
   */
  returnToRegistrationMessage() {
    return this.page.locator('[data-testid="return-to-registration"]')
  }

  /**
   * @returns {Promise<number>}
   */
  async changeControlCount() {
    return this.page.locator('#main-content button, #main-content form').count()
  }
}

export { RegisteredOnlyPeriodPage }
