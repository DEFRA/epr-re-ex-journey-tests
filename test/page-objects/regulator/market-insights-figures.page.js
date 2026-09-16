import { Page } from 'page-objects/page'

/**
 * What every page of market insights figures has in common, whichever set it
 * shows: it names the period the figures cover above the page's own name, and
 * it stamps the moment they were taken. epr-frontend serves these pages, so
 * this extends the base Page and relies on the global Playwright baseURL.
 */

// The heading states the period above the page's name, and the period is the
// half of it that ends in a year.
const STATES_A_YEAR = /\d{4}$/

// How a page of figures stamps the moment they were taken.
const DATA_TAKEN_AT = /^Data taken at /

class MarketInsightsFiguresPage extends Page {
  /**
   * The months the figures cover, as the heading states them above the page's
   * name.
   * @returns {Promise<string>}
   */
  async periodText() {
    return this.page
      .getByRole('heading', { level: 1 })
      .getByText(STATES_A_YEAR)
      .innerText()
  }

  /**
   * When the figures were taken, which a regulator holding the page beside the
   * workbook reads to tell whether the two were cut over the same span.
   * @returns {Promise<string>}
   */
  async dataTakenAtText() {
    return this.page.getByText(DATA_TAKEN_AT).innerText()
  }
}

export { MarketInsightsFiguresPage }
