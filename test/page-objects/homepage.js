import { Page } from 'page-objects/page'

class HomePage extends Page {
  open(lang = '') {
    return this.page.goto(lang + '/')
  }

  openStart(lang = '') {
    return this.page.goto(lang + '/start')
  }

  async getStartNowHref() {
    return this.page.locator('a.govuk-button').getAttribute('href')
  }

  async clickStartNow() {
    await this.page.locator('a.govuk-button').click()
  }

  async linkRegistration() {
    // GOV.UK radios visually hide the native input under a styled circle, so
    // clicking the input directly fails Playwright's actionability check —
    // click the label instead.
    await this.page.locator('label[for="organisation-id"]').click()
    await this.submit()
  }

  async navLinkElements() {
    return this.page
      .locator('ul#navigation li.govuk-service-navigation__item')
      .all()
  }

  async getNavLinkTexts() {
    return this.page
      .locator('ul#navigation li.govuk-service-navigation__item')
      .allInnerTexts()
  }

  /**
   * Get the href of a navigation link by its text
   * @param {string} text - The link text
   */
  async getNavigationLinkHref(text) {
    return this.page.locator('a', { hasText: text }).getAttribute('href')
  }

  // Phase Banner selector
  get phaseBannerTag() {
    return this.page.locator('.govuk-phase-banner__content__tag')
  }

  get phaseBannerFeedbackLink() {
    return this.page.locator('.govuk-phase-banner__text a')
  }

  /**
   * Get the phase banner tag text (e.g. "Beta")
   */
  async getPhaseTagText() {
    return this.phaseBannerTag.innerText()
  }

  /**
   * Get the feedback link href
   */
  async getFeedbackLinkHref() {
    return this.phaseBannerFeedbackLink.getAttribute('href')
  }

  /**
   * Get the feedback link text
   */
  async getFeedbackLinkText() {
    return this.phaseBannerFeedbackLink.innerText()
  }

  async homeLink() {
    await this.page.locator('a', { hasText: 'Home' }).click()
  }
}

export { HomePage }
