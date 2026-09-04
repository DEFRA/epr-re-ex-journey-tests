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
   * The breadcrumb sits outside the main content, so it is read on its own.
   * @returns {Promise<string[]>}
   */
  async breadcrumbs() {
    const texts = await this.page
      .locator('.govuk-breadcrumbs__list-item')
      .allInnerTexts()

    return texts.map((text) => text.trim())
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
   * The way back to the registration. The organisation crumb above it stops at
   * the organisation, so the registration is the only crumb naming one.
   * @returns {import('@playwright/test').Locator}
   */
  registrationLink() {
    return this.page.locator(
      '.govuk-breadcrumbs__list-item a[href*="/registrations/"]'
    )
  }

  /**
   * @returns {Promise<number>}
   */
  async changeControlCount() {
    return this.page.locator('#main-content button, #main-content form').count()
  }
}

export { RegisteredOnlyPeriodPage }
