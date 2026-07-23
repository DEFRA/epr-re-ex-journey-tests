import { expect } from '@playwright/test'
import { Page } from 'page-objects/page'

const SUBMIT_SELECTOR = '#main-content button[type=submit]'

class CreatePRNPage extends Page {
  open(orgId, regId) {
    return this.page.goto(
      `/organisations/${orgId}/registrations/${regId}/create-prn`
    )
  }

  async headingText() {
    const headingElement = this.page.locator('h1.govuk-heading-xl')
    await expect
      .poll(() => headingElement.innerText(), { timeout: 10000 })
      .toContain('Create a')
    return headingElement.innerText()
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
    await this.page.locator('#tonnage').fill(String(tonnes))
  }

  async enterValue(producer) {
    await this.page.locator('#recipient').fill(producer)
  }

  async submitAndCheckDoubleClickPrevented() {
    await super.submitAndCheckDoubleClickPrevented(SUBMIT_SELECTOR, {
      waitForNavigation: false
    })
  }

  async continue() {
    await this.submit(SUBMIT_SELECTOR)
  }

  async addIssuerNotes(notes) {
    await this.page.locator('#notes').fill(notes)
  }

  async materialDetails() {
    return this.page.locator('#main-content > div > div > form > p').innerText()
  }

  async wasteBalanceHint() {
    return this.page
      .locator('#main-content > div > div > div.govuk-inset-text')
      .innerText()
  }

  async errorMessages(expectedAmount) {
    const errorLinks = this.page.locator(
      '#main-content div[role=alert] ul li a'
    )
    await expect
      .poll(() => errorLinks.count(), { timeout: 5000 })
      .toBe(expectedAmount)
    return errorLinks.allInnerTexts()
  }
}

export { CreatePRNPage }
