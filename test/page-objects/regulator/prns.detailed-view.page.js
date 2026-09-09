import { Page } from 'page-objects/page'

/**
 * A table by the middle of its data-testid, keeping selectors in one place.
 * @param {string} name
 * @returns {string}
 */
const tableSelector = (name) =>
  `#main-content table[data-testid="prns-${name}-table"]`

class PrnsDetailedViewPage extends Page {
  /**
   * The page itself, so a journey can tell it from the operator's list.
   * @returns {import('@playwright/test').Locator}
   */
  detailedView() {
    return this.page.locator('#main-content [data-testid="prns-detailed-view"]')
  }

  /**
   * The caption's size is the design's to choose, so any size is read.
   * @returns {Promise<string>}
   */
  async captionText() {
    return this.page.locator('h1 [class^="govuk-caption-"]').innerText()
  }

  /**
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
  accreditationLink() {
    return this.page.locator(
      '.govuk-breadcrumbs__list-item a[href*="/accreditations/"]'
    )
  }

  /**
   * `role="tab"` only exists once the GDS JS enhances the anchors, so
   * `getByRole` waits on that enhancement rather than racing it.
   * @param {string} name
   * @returns {import('@playwright/test').Locator}
   */
  tab(name) {
    return this.page.getByRole('tab', { name, exact: true })
  }

  /**
   * @param {string} name
   * @returns {Promise<void>}
   */
  async selectTab(name) {
    await this.tab(name).click()
  }

  /**
   * A table's empty-state line, at its own testid plus `-none`.
   * @param {string} name
   * @returns {import('@playwright/test').Locator}
   */
  emptyState(name) {
    return this.page.locator(
      `#main-content [data-testid="prns-${name}-table-none"]`
    )
  }

  /**
   * @param {string} name
   * @returns {import('@playwright/test').Locator}
   */
  table(name) {
    return this.page.locator(tableSelector(name))
  }

  /**
   * @param {string} name
   * @returns {Promise<string[]>}
   */
  async headings(name) {
    return this.page
      .locator(`${tableSelector(name)} > thead > tr th`)
      .allInnerTexts()
  }

  /**
   * A table's data rows, keyed by column heading. The last row is its total.
   * @param {string} name
   * @returns {Promise<Map<string, string>[]>}
   */
  async rows(name) {
    return this.readRows(name, `${tableSelector(name)} > tbody > tr`, -1)
  }

  /**
   * The bold row summing the table's tonnage.
   * @param {string} name
   * @returns {Promise<Map<string, string>>}
   */
  async total(name) {
    const rows = await this.readRows(
      name,
      `${tableSelector(name)} > tbody > tr:last-child`,
      0
    )

    return rows[0]
  }

  /**
   * @param {string} name
   * @param {number} row
   * @returns {import('@playwright/test').Locator}
   */
  actionLink(name, row) {
    return this.page.locator(
      `${tableSelector(name)} > tbody > tr:nth-child(${row}) td:last-child a`
    )
  }

  /**
   * The line the page renders in place of the tabs when it holds no notes.
   * @returns {import('@playwright/test').Locator}
   */
  noPrnsMessage() {
    return this.page.locator('#main-content [data-testid="no-prns"]')
  }

  /**
   * @returns {Promise<number>}
   */
  async changeControlCount() {
    return this.page.locator('#main-content button, #main-content form').count()
  }

  /**
   * Rows keyed by heading. `drop` is how many to leave off the end, so a
   * caller can ask for the data rows without the total, or the total alone.
   * @param {string} name
   * @param {string} rowsSelector
   * @param {number} drop
   * @returns {Promise<Map<string, string>[]>}
   */
  async readRows(name, rowsSelector, drop) {
    const rows = this.page.locator(rowsSelector)
    await rows.first().waitFor({ state: 'visible' })

    const headings = await this.headings(name)

    const count = (await rows.count()) + drop
    const read = []

    for (let index = 0; index < count; index++) {
      const cells = await rows.nth(index).locator(':is(th, td)').allInnerTexts()

      read.push(
        new Map(headings.map((heading, cell) => [heading, cells[cell]]))
      )
    }

    return read
  }
}

export { PrnsDetailedViewPage }
