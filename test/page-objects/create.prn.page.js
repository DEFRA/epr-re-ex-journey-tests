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
      .toContain('details')
    return headingElement.innerText()
  }

  captionText() {
    return this.page.locator('#main-content .govuk-caption-xl').innerText()
  }

  async createPrn(tonnage, producer, issuerNotes, decemberWasteAnswer) {
    // Wait for the heading before interacting with the recipient field: it
    // progressively enhances into an accessible-autocomplete widget, and
    // typing into it before that JS has run leaves the underlying select
    // unset (matched by option value/id, not by the typed display name).
    await this.headingText()
    if (decemberWasteAnswer) {
      await this.selectDecemberWaste(decemberWasteAnswer)
    }
    await this.enterTonnage(tonnage)
    await this.enterValue(producer)
    await this.addIssuerNotes(issuerNotes)
    await this.continue()
  }

  // GOV.UK radios visually hide the native input under a styled circle, so
  // clicking the input directly fails Playwright's actionability check —
  // click the label instead. Item ids follow the idPrefix convention: the
  // first radio is the bare prefix, the second gets a "-2" suffix - "No" is
  // rendered first to match the design's default, so "Yes" is the second.
  async selectDecemberWaste(answer) {
    const id = answer === 'Yes' ? 'is-december-waste-2' : 'is-december-waste'
    await this.page.locator(`label[for="${id}"]`).click()
  }

  decemberWasteVisible() {
    return this.page.locator('#is-december-waste').isVisible()
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

  // Direct-child combinator: the material paragraph is a direct child of the
  // form, while the govukDetails help text further down also renders
  // <p class="govuk-body"> but nested inside .govuk-details__text - and the
  // cookie-consent banner (outside #main-content, but a plain descendant
  // selector wouldn't know that) renders two more govuk-body paragraphs of
  // its own.
  async materialDetails() {
    return this.page.locator('#main-content form > p.govuk-body').innerText()
  }

  async wasteBalanceHint() {
    return this.page.locator('#main-content .govuk-inset-text').innerText()
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
