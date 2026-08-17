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
   * Every route the summary cards offer, with the ids taken out of the paths
   * so a journey can name a route without knowing which record it landed on.
   * A journey compares the whole set rather than looking for one link: an
   * empty set fails that comparison, where asking whether one link is absent
   * is satisfied by a page that never loaded.
   *
   * @returns {Promise<string[]>}
   */
  async offeredRoutes() {
    const cards = this.page.locator('#main-content .govuk-summary-card')
    await cards.first().waitFor({ state: 'visible' })

    const hrefs = await cards
      .locator('a[href]')
      .evaluateAll((links) =>
        links.map((link) => link.getAttribute('href') ?? '')
      )

    // The cards are ordered by the page, so sort to compare the routes on
    // offer rather than the order they are laid out in.
    return hrefs.map((href) => href.replace(/[0-9a-f]{24}/g, '{id}')).sort()
  }
}

export { WasteRecordsPage }
