import { Page } from 'page-objects/page'

const SITE_TABLE = '#main-content table.govuk-table'

class RegulatorOrganisationPage extends Page {
  /**
   * @returns {Promise<string>}
   */
  async captionText() {
    return this.page.locator('h1 .govuk-caption-xl').innerText()
  }

  /**
   * @returns {import('@playwright/test').Locator}
   */
  siteTables() {
    return this.page.locator(SITE_TABLE)
  }

  /**
   * @param {number} site
   * @returns {import('@playwright/test').Locator}
   */
  siteTable(site) {
    return this.siteTables().nth(site - 1)
  }

  /**
   * @returns {Promise<string[]>}
   */
  async siteNames() {
    return this.page.locator(`${SITE_TABLE} > caption`).allInnerTexts()
  }

  /**
   * The wait settles on the first row, so a site that rendered none fails here
   * rather than answering with an empty list a caller could read as a pass.
   * @param {number} site
   * @returns {Promise<Map<string, string>[]>}
   */
  async registrations(site = 1) {
    const table = this.siteTable(site)
    const rows = table.locator('tbody > tr')
    await rows.first().waitFor({ state: 'visible' })

    const headings = await table.locator('thead > tr th').allInnerTexts()
    const count = await rows.count()
    const registrations = []

    for (let row = 0; row < count; row++) {
      const cells = await rows.nth(row).locator('th, td').allInnerTexts()

      registrations.push(
        new Map(headings.map((heading, cell) => [heading, cells[cell]]))
      )
    }

    return registrations
  }

  /**
   * @param {number} row
   * @param {number} site
   * @returns {import('@playwright/test').Locator}
   */
  actionLink(row, site = 1) {
    return this.siteTable(site).locator(
      `tbody > tr:nth-child(${row}) td:last-child a`
    )
  }

  /**
   * The span is clipped to a pixel, and innerText answers with what is
   * rendered, so this reads the text content instead.
   * @param {number} row
   * @param {number} site
   * @returns {Promise<string>}
   */
  async getActionHiddenText(row, site = 1) {
    const text = await this.actionLink(row, site)
      .locator('.govuk-visually-hidden')
      .textContent()

    return (text ?? '').trim()
  }

  /**
   * @returns {import('@playwright/test').Locator}
   */
  tabs() {
    return this.page.locator('#main-content .govuk-tabs__tab')
  }
}

export { RegulatorOrganisationPage }
