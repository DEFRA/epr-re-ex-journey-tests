import { MarketInsightsFiguresPage } from 'page-objects/regulator/market-insights-figures.page'

/**
 * The count of monthly returns owed and not submitted, laid out the way the
 * published tab is: a table per material, the tonnage bands down the side and
 * the reporting months across.
 */
class MarketInsightsOutstandingReturnsPage extends MarketInsightsFiguresPage {
  /**
   * What each table calls itself, above its own headings, in the order the
   * page renders them. The page serves a table per material, so reading the
   * whole set is what says which materials arrived.
   * @returns {Promise<string[]>}
   */
  async tableCaptions() {
    await this.page.getByRole('table').first().waitFor({ state: 'visible' })

    const texts = await this.page
      .getByRole('table')
      .locator('caption')
      .allInnerTexts()
    return texts.map((text) => text.trim())
  }

  /**
   * The column headings of every table, read table by table: the one that
   * names the row, then one per reporting month. Every table covers the same
   * period, so reading them all is what catches a table that lost a month.
   * @returns {Promise<string[][]>}
   */
  async columnHeadings() {
    await this.page.getByRole('table').first().waitFor({ state: 'visible' })

    const tables = await this.page.getByRole('table').all()

    return Promise.all(
      tables.map(async (table) => {
        const texts = await table.getByRole('columnheader').allInnerTexts()
        return texts.map((text) => text.trim())
      })
    )
  }

  /**
   * The tonnage bands each table states down its side, table by table. The
   * bands are the same four everywhere, smallest first, so a table that
   * dropped one or sorted them by their words shows up here.
   * @returns {Promise<string[][]>}
   */
  async tonnageBands() {
    await this.page.getByRole('table').first().waitFor({ state: 'visible' })

    const tables = await this.page.getByRole('table').all()

    return Promise.all(
      tables.map(async (table) => {
        const texts = await table.getByRole('rowheader').allInnerTexts()
        return texts.map((text) => text.trim())
      })
    )
  }

  /**
   * Every count the page states, read across every table it serves. The page
   * prints a zero where nothing is outstanding, so a cell that reads as
   * nothing at all is a fault rather than an absence, and reading them
   * together is what catches one.
   * @returns {Promise<string[]>}
   */
  async counts() {
    await this.page.getByRole('table').first().waitFor({ state: 'visible' })

    const texts = await this.page
      .getByRole('table')
      .getByRole('cell')
      .allInnerTexts()
    return texts.map((text) => text.trim())
  }
}

export { MarketInsightsOutstandingReturnsPage }
