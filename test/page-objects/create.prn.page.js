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

  async createPrn(
    tonnage,
    producer,
    issuerNotes,
    decemberWasteAnswer,
    wasteBalancePool
  ) {
    // Wait for the heading before interacting with the recipient field: it
    // progressively enhances into an accessible-autocomplete widget, and
    // typing into it before that JS has run leaves the underlying select
    // unset (matched by option value/id, not by the typed display name).
    await this.headingText()
    if (decemberWasteAnswer) {
      await this.selectDecemberWaste(decemberWasteAnswer)
    }
    if (wasteBalancePool) {
      await this.selectWasteBalance(wasteBalancePool)
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

  // Scoped by accessible name, not a hardcoded id, so this can't drift from
  // render order - a label click or getByLabel().click() hung here even
  // though the target was present and clickable by hand.
  async selectWasteBalance(pool) {
    const label = pool === 'December' ? /^December/ : /^Non-December/
    await this.page
      .getByRole('group', { name: 'Select which waste balance' })
      .getByRole('radio', { name: label })
      .check()
  }

  async wasteBalanceOptions() {
    return this.page
      .locator('#main-content .govuk-radios__label')
      .allInnerTexts()
  }

  // December is always rendered first (see resolve-december-waste-choice.js);
  // asserting it here means every tonnage read below can key off content
  // instead of re-deriving the same order assumption from a bare index.
  assertWasteBalanceOrder(options) {
    expect(options).toHaveLength(2)
    expect(options[0]).toMatch(
      /December waste balance \(\d[\d,]*\.\d{2} tonnes\)/
    )
    expect(options[1]).toMatch(
      /Non-December waste balance \(\d[\d,]*\.\d{2} tonnes\)/
    )
  }

  wasteBalanceTonnage(options, pool) {
    const prefix = pool === 'December' ? 'December' : 'Non-December'
    const option = options.find((text) => text.startsWith(prefix))
    const [, tonnage] = option.match(/\(([\d,.]+) tonnes\)/)
    return parseFloat(tonnage.replace(/,/g, ''))
  }

  async wasteBalances() {
    const options = await this.wasteBalanceOptions()
    return {
      december: this.wasteBalanceTonnage(options, 'December'),
      general: this.wasteBalanceTonnage(options, 'Non-December')
    }
  }

  // Re-fetches both pool balances via a fresh create-page visit, the
  // sequence every raise-then-recheck step in the December pool-choice
  // specs otherwise repeats inline.
  async reopenAndReadWasteBalances(
    dashboardPage,
    wasteRecordsPage,
    orgRefNo,
    isPern
  ) {
    await dashboardPage.open(orgRefNo)
    await dashboardPage.selectTableLink(1, 1)
    if (isPern) {
      await wasteRecordsPage.createNewPERNLink().click()
    } else {
      await wasteRecordsPage.createNewPRNLink().click()
    }
    await this.headingText()
    return this.wasteBalances()
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
