import { Page } from 'page-objects/page'

/**
 * The four tables the page draws, keyed by the half of their data-testid that
 * tells them apart. A caller names a table by that key rather than by a
 * selector, so the testid contract lives in one place.
 * @param {string} name
 * @returns {string}
 */
const tableSelector = (name) =>
  `#main-content table[data-testid="prns-${name}-table"]`

class PrnsDetailedViewPage extends Page {
  /**
   * The page itself, so a journey can say it landed here rather than on the
   * operator's list at the same address.
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
   * The way back to the accreditation. The crumbs above it stop at the
   * registration, so the accreditation is the only crumb naming one.
   * @returns {import('@playwright/test').Locator}
   */
  accreditationLink() {
    return this.page.locator(
      '.govuk-breadcrumbs__list-item a[href*="/accreditations/"]'
    )
  }

  /**
   * The GOV.UK tabs component only assigns role="tab" once its JS enhances the
   * plain anchors on load, so getByRole waits on the enhancement rather than
   * racing it.
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
   * The line a table shows in its own place when the accreditation has nothing
   * to put in it. Each carries the table's testid with `-none` on the end, so
   * a tab holding two tables says so twice rather than once for the panel.
   * @param {string} name
   * @returns {import('@playwright/test').Locator}
   */
  emptyState(name) {
    return this.page.locator(
      `#main-content [data-testid="prns-${name}-table-none"]`
    )
  }

  /**
   * The table a tab draws, so a journey can say a tab holds none rather than
   * that its rows are hidden.
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
   * Every row a table holds bar its total, keyed by column heading. A table
   * that renders at all carries a total row as its last, so the data rows are
   * the ones before it.
   *
   * The period-style row header the reports table uses is not drawn here, but
   * both cell types are read anyway so a table that gains one does not shift
   * every remaining column one to the left.
   * @param {string} name
   * @returns {Promise<Map<string, string>[]>}
   */
  async rows(name) {
    return this.readRows(name, `${tableSelector(name)} > tbody > tr`, -1)
  }

  /**
   * The bold row summing the tonnage of the table above it.
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
   * The row's action anchor, so a journey can read what a row offers before it
   * follows it.
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
   * The paragraph the page renders in place of the tabs when the accreditation
   * has issued nothing a regulator can see.
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
   * Reads the rows a selector matches into maps keyed by the table's headings.
   * `drop` is how many rows off the end to leave out, so the callers above can
   * ask for the data rows without the total or for the total on its own.
   *
   * The wait settles on the first row, so a table that rendered none fails here
   * rather than answering with an empty list a caller could read as a pass.
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
