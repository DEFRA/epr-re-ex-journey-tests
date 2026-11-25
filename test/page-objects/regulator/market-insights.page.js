import { Page } from 'page-objects/page'

/**
 * @import { Locator } from '@playwright/test'
 */

/**
 * The front of the market insights preview. It names each set of figures the
 * monthly publication carries and links to the page that shows it, so a
 * regulator reaches every set from here. epr-frontend serves it, so this
 * extends the base Page and relies on the global Playwright baseURL.
 */
class MarketInsightsPage extends Page {
  /**
   * The sets of figures the page offers, by the words a regulator reads.
   * Reading the whole set is what says which pages are on offer, rather than
   * that one link happened to match.
   *
   * Scoped to the list rather than the whole of `main`, because the page also
   * carries actions that are not sets of figures.
   * @returns {Promise<string[]>}
   */
  async figureSetNames() {
    const texts = await this.page
      .getByRole('main')
      .getByRole('list')
      .getByRole('link')
      .allInnerTexts()

    return texts.map((text) => text.trim())
  }

  /**
   * @param {string} name
   * @returns {Locator}
   */
  figureSetLink(name) {
    return this.page.getByRole('link', { name, exact: true })
  }

  /**
   * The link that takes every figure away as one zip. It is an action rather
   * than a set of figures, so it sits outside the list `figureSetNames` reads.
   * @returns {Locator}
   */
  exportLink() {
    return this.page.getByRole('link', {
      name: 'Download all the figures (ZIP)',
      exact: true
    })
  }

  /** @returns {Locator} */
  yearHeading() {
    return this.page.getByRole('heading', { name: /^This is \d{4} data$/ })
  }

  /** @returns {Locator} */
  chooseDifferentYearLink() {
    return this.page.getByRole('link', {
      name: 'Choose a different year',
      exact: true
    })
  }

  /**
   * The year the address names, which the page's figures are for.
   * @returns {number}
   */
  yearInAddress() {
    return Number(new URL(this.page.url()).pathname.split('/').pop())
  }

  /** @param {number} year */
  async expectYear(year) {
    await this.expectYearShown(
      this.yearHeading(),
      `This is ${year} data`,
      new RegExp(`/regulators/market-insights/${year}$`)
    )
  }
}

// The page's heading, which every page of figures names in its trail back here.
const LANDING_HEADING = 'Reported reprocessor and exporter packaging waste data'

export { LANDING_HEADING, MarketInsightsPage }
