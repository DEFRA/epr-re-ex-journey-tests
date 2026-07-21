import { $, $$, browser } from '@wdio/globals'
import { checkDoubleClickPrevented } from '../support/double-click.js'

class CreatePRNPage {
  open(orgId, regId) {
    return browser.url(
      `/organisations/${orgId}/registrations/${regId}/create-prn`
    )
  }

  async headingText() {
    const headingElement = await $('h1.govuk-heading-xl')
    await browser.waitUntil(
      async () => (await headingElement.getText()).includes('Create a'),
      { timeout: 10000 }
    )
    return await headingElement.getText()
  }

  async createPrn(tonnage, producer, issuerNotes) {
    // Wait for the heading before interacting with the recipient field: it
    // progressively enhances into an accessible-autocomplete widget, and
    // typing into it before that JS has run leaves the underlying select
    // unset (matched by option value/id, not by the typed display name).
    await this.headingText()
    await this.enterTonnage(tonnage)
    await this.enterValue(producer)
    await this.addIssuerNotes(issuerNotes)
    await this.continue()
  }

  async enterTonnage(tonnes) {
    await $('#tonnage').setValue(tonnes)
  }

  async enterValue(producer) {
    await $('#recipient').setValue(producer)
  }

  async submitAndCheckDoubleClickPrevented() {
    await checkDoubleClickPrevented('#main-content button[type=submit]', {
      waitForNavigation: false
    })
  }

  async continue() {
    await $('#main-content button[type=submit]').click()
  }

  async addIssuerNotes(notes) {
    await $('#notes').setValue(notes)
  }

  async materialDetails() {
    return await $('#main-content > div > div > form > p').getText()
  }

  async wasteBalanceHint() {
    const wasteBalanceHintElement = await $(
      '#main-content > div > div > div.govuk-inset-text'
    )
    await wasteBalanceHintElement.waitForExist({ timeout: 10000 })
    return wasteBalanceHintElement.getText()
  }

  async errorMessages(expectedAmount) {
    await browser.waitUntil(
      async () => {
        const elements = await $$('#main-content div[role=alert] ul li a')
        return elements.length === expectedAmount
      },
      {
        timeout: 5000,
        timeoutMsg: 'Expected to find error list items'
      }
    )
    const errorLinks = await $$('#main-content div[role=alert] ul li a')
    return await errorLinks.map((el) => el.getText())
  }
}

export default new CreatePRNPage()
