import { MarketInsightsFiguresPage } from 'page-objects/regulator/market-insights-figures.page'

/**
 * @import { Locator } from '@playwright/test'
 */

/**
 * The UK waste balance laid out the way the published tab is, one row per
 * material and accreditation type with the reporting months across as columns.
 */

// What the table calls itself, above its own headings, and so the name a
// regulator and a screen reader both find it by.
const TABLE = 'Waste balance'

// The row header names the material, so it sits outside the columns read as
// cells. The accreditation type is the first of those, and every cell after it
// states a figure: one per reporting month, then the row's total.
const ACCREDITATION_TYPE_CELL = 2
const FIRST_FIGURE_CELL = 3

// The row beneath the figures counts the monthly reports submitted against
// those due. Its header spans the two columns that name every other row.
const REPORTS_ROW_HEADER = 'Monthly reports submitted'

/**
 * The figure a cell states. A figure few operators contributed to is followed
 * by the confidential shorthand, which is not part of the figure.
 * @param {string} text
 * @returns {string}
 */
const figureOf = (text) => text.trim().replace(/ \[c\]$/, '')

class MarketInsightsWasteBalancePage extends MarketInsightsFiguresPage {
  /**
   * @returns {Locator}
   */
  table() {
    return this.page.getByRole('table', { name: TABLE })
  }

  /**
   * The headings of the figures table, in column order: the two that name the
   * row, then one per reporting month, then the total.
   * @returns {Promise<string[]>}
   */
  async columnHeadings() {
    await this.table().waitFor({ state: 'visible' })

    const texts = await this.table().getByRole('columnheader').allInnerTexts()
    return texts.map((text) => text.trim())
  }

  /**
   * @returns {Locator}
   */
  reportsRowHeader() {
    return this.page.getByRole('rowheader', { name: REPORTS_ROW_HEADER })
  }

  /**
   * The rows that state a material's figures, which is every row of the body
   * but the report count beneath them.
   * @returns {Locator}
   */
  figureRows() {
    return this.table()
      .locator('tbody tr')
      .filter({ hasNot: this.reportsRowHeader() })
  }

  /**
   * The accreditation type of every figure row, in the order the table renders
   * them. Other journeys seed their own operators while this one runs, so the
   * set is read whole rather than by position.
   * @returns {Promise<string[]>}
   */
  async accreditationTypes() {
    await this.table().waitFor({ state: 'visible' })

    const texts = await this.figureRows()
      .locator(`td:nth-child(${ACCREDITATION_TYPE_CELL})`)
      .allInnerTexts()
    return texts.map((text) => text.trim())
  }

  /**
   * Every figure the table states, read across all of its figure rows: the
   * monthly net credits and the totals beside them. The page prints a zero
   * where a month credited nothing, so a cell that reads as nothing at all is
   * a fault rather than an absence, and reading them together is what catches
   * one.
   * @returns {Promise<string[]>}
   */
  async figures() {
    await this.table().waitFor({ state: 'visible' })

    const texts = await this.figureRows()
      .locator(`td:nth-child(n + ${FIRST_FIGURE_CELL})`)
      .allInnerTexts()
    return texts.map((text) => figureOf(text))
  }

  /**
   * How many of the monthly reports each month expected the figures include,
   * one count per reporting month, then the period's.
   * @returns {Promise<string[]>}
   */
  async reportCounts() {
    await this.table().waitFor({ state: 'visible' })

    const texts = await this.table()
      .locator('tbody tr')
      .filter({ has: this.reportsRowHeader() })
      .getByRole('cell')
      .allInnerTexts()
    return texts.map((text) => text.trim())
  }
}

export { MarketInsightsWasteBalancePage }
