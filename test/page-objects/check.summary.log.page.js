class CheckSummaryLogPage {
  constructor(page) {
    this.page = page
  }

  async allSectionHeadings() {
    return this.page.locator('h2.govuk-heading-l').allInnerTexts()
  }

  async allSubStateHeadings() {
    return this.page.locator('h3.govuk-heading-m').allInnerTexts()
  }

  async expandAllLoadDetails() {
    const summaries = this.page.locator('details.govuk-details summary')
    const count = await summaries.count()
    for (let i = 0; i < count; i++) {
      await summaries.nth(i).click()
    }
  }

  async loadRowItems() {
    return this.page.locator('.epr-load-sections__rows li').allInnerTexts()
  }

  async loadDetailsText() {
    const texts = await this.page
      .locator('.govuk-details__text')
      .allInnerTexts()
    return texts.join(' | ')
  }

  async upload() {
    await this.page.locator('#main-content button[type=submit]').click()
  }

  // The PAE-1648 "Important" notification banner shown when the upload contains
  // closed-period adjustments. Guarded behind FEATURE_FLAG_CLOSED_PERIOD_ADJUSTMENTS.
  importantBanner() {
    return this.page.locator('.govuk-notification-banner')
  }
}

export { CheckSummaryLogPage }
