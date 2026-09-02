import { Page } from 'page-objects/page'

class AccreditationDetailsPage extends Page {
  /**
   * @returns {Promise<string>}
   */
  async captionText() {
    return this.page.locator('h1 .govuk-caption-xl').innerText()
  }

  /**
   * @returns {Promise<Record<string, string>>}
   */
  async summary() {
    return this.toDataMap(
      this.page.locator('#main-content dl.govuk-summary-list > div')
    )
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

export { AccreditationDetailsPage }
