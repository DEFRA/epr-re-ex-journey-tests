import { Page } from 'page-objects/page'

const PERIODS_TABLE = '#main-content table.govuk-table'

class RegistrationDetailsPage extends Page {
  /**
   * @returns {Promise<string>}
   */
  async captionText() {
    return this.page.locator('h1 .govuk-caption-xl').innerText()
  }

  /**
   * @returns {Promise<Record<string, string>>}
   */
  async summary() {
    return this.toDataMap(
      this.page.locator('#main-content dl.govuk-summary-list > div')
    )
  }

  /**
   * The wait settles on the first row, so a page that rendered none fails here
   * rather than answering with an empty list a caller could read as a pass.
   * @returns {Promise<Map<string, string>[]>}
   */
  async accreditedPeriods() {
    const rows = this.page.locator(`${PERIODS_TABLE} > tbody > tr`)
    await rows.first().waitFor({ state: 'visible' })

    const headings = await this.page
      .locator(`${PERIODS_TABLE} > thead > tr th`)
      .allInnerTexts()

    const count = await rows.count()
    const periods = []

    for (let index = 1; index <= count; index++) {
      const cells = await this.page
        .locator(
          `${PERIODS_TABLE} > tbody > tr:nth-child(${index}) th, ${PERIODS_TABLE} > tbody > tr:nth-child(${index}) td`
        )
        .allInnerTexts()

      periods.push(
        new Map(headings.map((heading, cell) => [heading, cells[cell]]))
      )
    }

    return periods
  }

  /**
   * @param {number} row
   * @returns {import('@playwright/test').Locator}
   */
  actionLink(row) {
    return this.page.locator(
      `${PERIODS_TABLE} > tbody > tr:nth-child(${row}) td:last-child a`
    )
  }

  /**
   * The span is clipped to a pixel, and innerText answers with what is
   * rendered, so this reads the text content instead.
   * @param {number} row
   * @returns {Promise<string>}
   */
  async getActionHiddenText(row) {
    const text = await this.actionLink(row)
      .locator('.govuk-visually-hidden')
      .textContent()

    return (text ?? '').trim()
  }

  /**
   * The breadcrumb sits outside the main content, so it is read on its own.
   * @returns {Promise<string[]>}
   */
  async breadcrumbs() {
    const texts = await this.page
      .locator('.govuk-breadcrumbs__list-item')
      .allInnerTexts()

    return texts.map((text) => text.trim())
  }

  /**
   * @returns {import('@playwright/test').Locator}
   */
  notesListLink() {
    return this.page.locator(
      '#main-content a[href$="/packaging-recycling-notes"]'
    )
  }

  /**
   * @returns {import('@playwright/test').Locator}
   */
  reportsListLink() {
    return this.page.locator('#main-content a[href$="/reports"]')
  }

  /**
   * @returns {import('@playwright/test').Locator}
   */
  wasteBalanceLedgerLink() {
    return this.page.locator('#main-content a[href$="/waste-balance-ledger"]')
  }

  /**
   * @returns {Promise<string[]>}
   */
  async offeredRoutes() {
    await this.page.locator('h1').waitFor({ state: 'visible' })

    const hrefs = await this.page
      .locator('#main-content a[href]')
      .evaluateAll((links) =>
        links.map((link) => link.getAttribute('href') ?? '')
      )

    return hrefs.map((href) => href.replace(/[0-9a-f]{24}/g, '{id}')).sort()
  }

  /**
   * @returns {Promise<number>}
   */
  async changeControlCount() {
    return this.page.locator('#main-content button, #main-content form').count()
  }
}

export { RegistrationDetailsPage }
