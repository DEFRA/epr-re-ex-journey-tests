import { browser, $, $$ } from '@wdio/globals'
import { Page } from 'page-objects/page'

class HomePage extends Page {
  open(lang = '') {
    return browser.url(lang + '/')
  }

  openStart(lang = '') {
    return browser.url(lang + '/start')
  }

  async getStartNowHref() {
    return await $('a.govuk-button').getAttribute('href')
  }

  async clickStartNow() {
    await $('a.govuk-button').click()
  }

  async linkRegistration() {
    // GOV.UK radios visually hide the native input under a styled circle, so
    // clicking the input directly fails WebdriverIO's clickability check —
    // click the label instead.
    await $('label[for="organisation-id"]').click()
    await $('button[type=submit]').click()
  }

  async navLinkElements() {
    return await $$(
      'ul#navigation li.govuk-service-navigation__item'
    ).getElements()
  }

  async getNavLinkTexts() {
    const links = await this.navLinkElements()
    const texts = []
    for (const link of links) {
      texts.push(await link.getText())
    }
    return texts
  }

  /**
   * Get the href of a navigation link by its text
   * @param {string} text - The link text
   */
  async getNavigationLinkHref(text) {
    return await $(`a*=${text}`).getAttribute('href')
  }

  // Phase Banner selector
  get phaseBannerTag() {
    return $('.govuk-phase-banner__content__tag')
  }

  get phaseBannerFeedbackLink() {
    return $('.govuk-phase-banner__text a')
  }

  /**
   * Get the phase banner tag text (e.g. "Beta")
   */
  async getPhaseTagText() {
    return await this.phaseBannerTag.getText()
  }

  /**
   * Get the feedback link href
   */
  async getFeedbackLinkHref() {
    return await this.phaseBannerFeedbackLink.getAttribute('href')
  }

  /**
   * Get the feedback link text
   */
  async getFeedbackLinkText() {
    return await this.phaseBannerFeedbackLink.getText()
  }

  async homeLink() {
    await $('a*=Home').click()
  }
}

export default new HomePage()
