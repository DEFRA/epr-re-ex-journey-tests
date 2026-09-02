import { Page } from 'page-objects/page'

const REPORTS_TABLE = '#main-content table[data-testid="reports-table"]'

class AccreditationDetailsPage extends Page {
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
   * The way back to the registration. The organisation crumb above it stops at
   * the organisation, so the registration is the only crumb naming one.
   * @returns {import('@playwright/test').Locator}
   */
  registrationLink() {
    return this.page.locator(
      '.govuk-breadcrumbs__list-item a[href*="/registrations/"]'
    )
  }

  /**
   * @returns {Promise<string[]>}
   */
  async reportHeadings() {
    return this.page.locator(`${REPORTS_TABLE} > thead > tr th`).allInnerTexts()
  }

  /**
   * Every reports row, keyed by column heading. The period is rendered as a
   * row header, so both cell types are read - the base helper takes td alone,
   * which would drop the period and shift every remaining column one to the
   * left.
   *
   * The wait settles on the first row, so a page that rendered none fails
   * here rather than answering with an empty list a caller could read as a
   * pass.
   * @returns {Promise<Map<string, string>[]>}
   */
  async reports() {
    const rows = this.page.locator(`${REPORTS_TABLE} > tbody > tr`)
    await rows.first().waitFor({ state: 'visible' })

    const headings = await this.reportHeadings()

    const count = await rows.count()
    const reports = []

    for (let index = 1; index <= count; index++) {
      const cells = await this.page
        .locator(
          `${REPORTS_TABLE} > tbody > tr:nth-child(${index}) th, ${REPORTS_TABLE} > tbody > tr:nth-child(${index}) td`
        )
        .allInnerTexts()

      reports.push(
        new Map(headings.map((heading, cell) => [heading, cells[cell]]))
      )
    }

    return reports
  }

  /**
   * @param {number} row
   * @returns {import('@playwright/test').Locator}
   */
  reportActionLink(row) {
    return this.page.locator(
      `${REPORTS_TABLE} > tbody > tr:nth-child(${row}) td:last-child a`
    )
  }

  /**
   * The span is clipped to a pixel, and innerText answers with what is
   * rendered, so this reads the text content instead.
   * @param {number} row
   * @returns {Promise<string>}
   */
  async getReportActionHiddenText(row) {
    const text = await this.reportActionLink(row)
      .locator('.govuk-visually-hidden')
      .textContent()

    return (text ?? '').trim()
  }

  /**
   * The paragraph the page renders in place of the table when there is
   * nothing to report on.
   * @returns {import('@playwright/test').Locator}
   */
  noReportsMessage() {
    return this.page.locator('#main-content [data-testid="no-reports"]')
  }

  /**
   * @returns {Promise<number>}
   */
  async changeControlCount() {
    return this.page.locator('#main-content button, #main-content form').count()
  }
}

export { AccreditationDetailsPage }
