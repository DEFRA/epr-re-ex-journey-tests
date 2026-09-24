import {
  MarketInsightsFiguresPage,
  figureOf
} from 'page-objects/regulator/market-insights-figures.page'

/**
 * The reprocessor and exporter figures laid out the way the published tab is,
 * a reprocessor table and an exporter table for every month of the period.
 * One page serves the UK and each published nation, so this reads either.
 */
class MarketInsightsReprocessorExporterPage extends MarketInsightsFiguresPage {
  /**
   * What each table calls itself, above its own headings, in the order the
   * page renders them. The page serves a reprocessor table and an exporter
   * table per month, so reading the whole set is what says which months
   * arrived and that both halves came with each of them.
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
   * Every figure the page states, read across every table it serves. The page
   * prints a zero where nothing was reported, so a cell that reads as nothing
   * at all is a fault rather than an absence, and reading them together is
   * what catches one.
   * @returns {Promise<string[]>}
   */
  async figures() {
    await this.page.getByRole('table').first().waitFor({ state: 'visible' })

    const texts = await this.page
      .getByRole('table')
      .getByRole('cell')
      .allInnerTexts()
    return texts.map((text) => figureOf(text))
  }
}

export { MarketInsightsReprocessorExporterPage }
