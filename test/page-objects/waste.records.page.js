import { Page } from 'page-objects/page'

class WasteRecordsPage extends Page {
  open(orgId, regId) {
    return this.page.goto(`/organisations/${orgId}/registrations/${regId}`)
  }

  async submitSummaryLogLink() {
    await this.page.locator('a', { hasText: 'Upload your summary log' }).click()
  }

  async createNewPRNLink() {
    await this.page.locator('a', { hasText: 'Create new PRN' }).click()
  }

  async managePRNsLink() {
    await this.page.locator('a', { hasText: 'Manage PRNs' }).click()
  }

  async managePERNsLink() {
    await this.page.locator('a', { hasText: 'Manage PERNs' }).click()
  }

  async createNewPERNLink() {
    await this.page.locator('a', { hasText: 'Create new PERN' }).click()
  }

  async manageReportsLink() {
    await this.page.locator('a', { hasText: 'Manage reports' }).click()
  }

  /**
   * The link into the note list, found by where it goes rather than by what it
   * says. The route is the same for a PRN and a PERN, and the same for every
   * session, so a journey can follow it and still assert the text the session
   * was offered.
   *
   * @returns {import('@playwright/test').Locator}
   */
  notesListLink() {
    return this.page.locator(
      '#main-content .govuk-summary-card a[href$="/packaging-recycling-notes"]'
    )
  }

  /**
   * The link into the reports list, on the same terms as the note list above.
   *
   * @returns {import('@playwright/test').Locator}
   */
  reportsListLink() {
    return this.page.locator(
      '#main-content .govuk-summary-card a[href$="/reports"]'
    )
  }

  // The "Registration and accreditation" summary card. Scoping by its heading
  // keeps the link lookup robust against sibling cards on the same page.
  registrationAndAccreditationCard() {
    return this.page.locator('.govuk-summary-card', {
      has: this.page.getByRole('heading', {
        name: 'Registration and accreditation'
      })
    })
  }

  // The "apply for {year} accreditation" reapply link, present only when the
  // operator is eligible (PAE-1791).
  reapplyAccreditationLink() {
    return this.registrationAndAccreditationCard().getByRole('link', {
      name: /^apply for \d{4} accreditation$/
    })
  }

  /**
   * The link into the waste balance ledger. It sits in the page body rather
   * than in a summary card, because the ledger explains the balance printed
   * above it rather than being one of the tasks the registration offers.
   *
   * @returns {import('@playwright/test').Locator}
   */
  wasteBalanceLedgerLink() {
    return this.page.locator('#main-content a[href$="/waste-balance-ledger"]')
  }

  /**
   * Every route the page offers, with the ids taken out of the paths so a
   * journey can name a route without knowing which record it landed on. A
   * journey compares the whole set rather than looking for one link: an empty
   * set fails that comparison, where asking whether one link is absent is
   * satisfied by a page that never loaded.
   *
   * This reads the whole of the main content, not the summary cards alone.
   * The page renders its own links inside it and the template puts the header,
   * the footer and the back link outside it, so the set is every route the
   * page offers and nothing more. Scoping to the cards let a link in the page
   * body arrive without the comparison ever seeing it.
   *
   * @returns {Promise<string[]>}
   */
  async offeredRoutes() {
    // The page is served as one document, so waiting on the first card says
    // the whole body is there before the links are read.
    const cards = this.page.locator('#main-content .govuk-summary-card')
    await cards.first().waitFor({ state: 'visible' })

    const hrefs = await this.page
      .locator('#main-content a[href]')
      .evaluateAll((links) =>
        links.map((link) => link.getAttribute('href') ?? '')
      )

    // The cards are ordered by the page, so sort to compare the routes on
    // offer rather than the order they are laid out in.
    return hrefs.map((href) => href.replace(/[0-9a-f]{24}/g, '{id}')).sort()
  }
}

export { WasteRecordsPage }
