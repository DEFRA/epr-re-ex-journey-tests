import { Page } from 'page-objects/page'

/**
 * The preview of the monthly market insights publication: the UK waste balance
 * laid out the way the published tab is, one row per material and accreditation
 * type with the reporting months across as columns. epr-frontend serves it, so
 * this extends the base Page and relies on the global Playwright baseURL.
 */

const TABLE = '[data-testid="app-page-body"] table.govuk-table'

// The row header names the material, so it sits outside the columns read as
// cells. The accreditation type is the first of those, and every cell after it
// states a figure: one per reporting month, then the row's total.
const ACCREDITATION_TYPE_CELL = 2
const FIRST_FIGURE_CELL = 3

class MarketInsightsPage extends Page {
  /**
   * The months the figures cover. The caption's size is the design's to
   * choose, so any size is read.
   * @returns {Promise<string>}
   */
  async captionText() {
    return this.page.locator('h1 [class*="govuk-caption-"]').innerText()
  }

  /**
   * When the figures were taken, which a regulator holding the page beside the
   * workbook reads to tell whether the two were cut over the same span.
   * @returns {Promise<string>}
   */
  async dataTakenAtText() {
    return this.page.locator('main p.govuk-body-s').innerText()
  }

  /**
   * What the table calls itself, above its own headings.
   * @returns {Promise<string>}
   */
  async tableCaptionText() {
    return this.page.locator(`${TABLE} caption`).innerText()
  }

  /**
   * The headings of the figures table, in column order: the two that name the
   * row, then one per reporting month, then the total.
   * @returns {Promise<string[]>}
   */
  async columnHeadings() {
    await this.page.locator(TABLE).waitFor({ state: 'visible' })

    const texts = await this.page.locator(`${TABLE} thead th`).allInnerTexts()
    return texts.map((text) => text.trim())
  }

  /**
   * The accreditation type of every row, in the order the table renders them.
   * Other journeys seed their own operators while this one runs, so the set is
   * read whole rather than by position.
   * @returns {Promise<string[]>}
   */
  async accreditationTypes() {
    await this.page.locator(TABLE).waitFor({ state: 'visible' })

    const texts = await this.page
      .locator(`${TABLE} tbody tr td:nth-child(${ACCREDITATION_TYPE_CELL})`)
      .allInnerTexts()
    return texts.map((text) => text.trim())
  }

  /**
   * Every figure the table states, read across all of its rows: the monthly
   * net credits and the totals beside them. The page prints a zero where a
   * month credited nothing, so a cell that reads as nothing at all is a fault
   * rather than an absence, and reading them together is what catches one.
   * @returns {Promise<string[]>}
   */
  async figures() {
    await this.page.locator(TABLE).waitFor({ state: 'visible' })

    const texts = await this.page
      .locator(`${TABLE} tbody tr td:nth-child(n + ${FIRST_FIGURE_CELL})`)
      .allInnerTexts()
    return texts.map((text) => text.trim())
  }
}

export { MarketInsightsPage }
