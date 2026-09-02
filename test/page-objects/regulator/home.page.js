import { Page } from 'page-objects/page'

/**
 * @import { Locator } from '@playwright/test'
 */

/**
 * Where a regulator lands after sign-in. It is the organisation list: a
 * regulator holds no organisation id, so search is the only route they have to
 * an operator, and the service puts it in front of them rather than behind a
 * link. Like the regulator sign-in, epr-frontend serves this itself, so it
 * extends the base Page and relies on the global Playwright baseURL.
 */

// The data columns of a results row, by their position among the row's cells.
// The name is the row header and so is cell 1, which is why it sits outside
// this map. Cell 5 is the action, which is a link rather than a value.
const RESULT_COLUMNS = {
  organisationId: 2,
  regulator: 3,
  status: 4
}

const ACTION_CELL = 5

const TABLE = '#main-content table.govuk-table'

class RegulatorHomePage extends Page {
  async getHeadingText() {
    return this.page.locator('main h1').innerText()
  }

  /**
   * The line under the heading that says what the page is for.
   * @returns {Promise<string>}
   */
  async getDescriptionText() {
    return this.page.locator('main h1 + p').innerText()
  }

  /**
   * Every heading the page puts above a section, in the order it renders them.
   * Reading the whole set is what says a section is present and named rather
   * than that one selector happened to match.
   * @returns {Promise<string[]>}
   */
  async getSectionHeadings() {
    const texts = await this.page.locator('main h2').allInnerTexts()
    return texts.map((text) => text.trim())
  }

  /**
   * The headings of the results table, in column order.
   * @returns {Promise<string[]>}
   */
  async getColumnHeadings() {
    await this.page.locator(TABLE).waitFor({ state: 'visible' })

    const texts = await this.page.locator(`${TABLE} thead th`).allInnerTexts()
    return texts.map((text) => text.trim())
  }

  /**
   * What the search box currently holds. A search leaves its term behind, so
   * this is how a journey proves the page came back with the search still on.
   * @returns {Promise<string>}
   */
  async getSearchTerm() {
    return this.page.locator('#search').inputValue()
  }

  /**
   * Searches on organisation name. The form takes one field, so a search
   * always replaces the previous one rather than narrowing it.
   *
   * @param {string} organisationName
   * @returns {Promise<void>}
   */
  async searchFor(organisationName) {
    await this.page.locator('#search').fill(organisationName)
    await this.page.getByRole('button', { name: 'Search' }).click()
  }

  /**
   * Every control the search panel offers, by its visible words. The panel
   * gains a way out of a running search, so the whole set is what says which
   * state the page is in.
   * @returns {Promise<string[]>}
   */
  async getSearchControls() {
    const texts = await this.page
      .locator('.epr-search-panel .govuk-button')
      .allInnerTexts()

    return texts.map((text) => text.trim())
  }

  /**
   * The link that drops the search term by addressing the unsearched page,
   * rather than sending an empty search.
   * @returns {Locator}
   */
  clearSearchLink() {
    return this.page.locator('.epr-search-panel a.govuk-button')
  }

  /**
   * Every row the results table is showing. The page carries no result count,
   * so the length of this is what a journey counts.
   *
   * @returns {Promise<Array<Record<string, string>>>}
   */
  async getTableData() {
    // Submitting the search reloads the page, and the reads below take the DOM
    // as it stands with no auto-wait - so settle on the results table first.
    await this.page.locator(TABLE).waitFor({ state: 'visible' })

    const rows = this.page.locator(`${TABLE} tbody tr`)
    const count = await rows.count()
    const data = []

    for (let i = 0; i < count; i++) {
      const row = rows.nth(i)
      /** @type {Record<string, string>} */
      const record = {
        name: await row.locator('th.govuk-table__header').innerText()
      }

      for (const [column, cell] of Object.entries(RESULT_COLUMNS)) {
        record[column] = await row.locator(`td:nth-child(${cell})`).innerText()
      }

      data.push(record)
    }

    return data
  }

  /**
   * The classes the status cell's tag wears. The colour is what separates one
   * status from another at a glance, so a journey reads the class rather than
   * only the word.
   *
   * @param {number} row
   * @returns {Promise<string>}
   */
  async getStatusTagClasses(row) {
    return this.page
      .locator(
        `${TABLE} tbody tr:nth-child(${row}) td:nth-child(${RESULT_COLUMNS.status}) .govuk-tag`
      )
      .getAttribute('class')
  }

  /**
   * The action a results row offers. Every one of them reads the same, so the
   * hidden half of its name is what tells a reader which organisation it
   * opens.
   *
   * @param {number} row
   * @returns {Locator}
   */
  actionLink(row) {
    return this.page.locator(
      `${TABLE} tbody tr:nth-child(${row}) td:nth-child(${ACTION_CELL}) a`
    )
  }

  /**
   * The organisation name a row's action link carries for a screen reader.
   * The span is clipped to a pixel, and innerText answers with what is
   * rendered, so this reads the text content instead.
   *
   * @param {number} row
   * @returns {Promise<string>}
   */
  async getActionHiddenText(row) {
    const text = await this.actionLink(row)
      .locator('.govuk-visually-hidden')
      .textContent()

    return (text ?? '').trim()
  }
}

export { RegulatorHomePage }
