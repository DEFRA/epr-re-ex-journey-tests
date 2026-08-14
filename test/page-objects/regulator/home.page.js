import { Page } from 'page-objects/page'

/**
 * Where a regulator lands after sign-in. It is the organisation search: a
 * regulator holds no organisation id, so search is the only route they have to
 * an operator, and the service puts it in front of them rather than behind a
 * link. Like the regulator sign-in, epr-frontend serves this itself, so it
 * extends the base Page and relies on the global Playwright baseURL.
 */

// The results columns in order: Name, Organisation ID, Regulator, Status. The
// name is the row header and carries the link to the organisation, so it sits
// outside this map.
const RESULT_COLUMNS = {
  organisationId: 2,
  regulator: 3,
  status: 4
}

const TABLE = '#main-content table.govuk-table'

class RegulatorHomePage extends Page {
  async getHeadingText() {
    return this.page.locator('main h1').innerText()
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
    await this.page.locator('button[type=submit]').click()
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
   * Opens the organisation a results row names. The name is the link, which is
   * the only thing a regulator can do from a row.
   *
   * @param {number} row
   * @returns {Promise<void>}
   */
  async openOrganisation(row) {
    await this.page
      .locator(`${TABLE} tbody tr:nth-child(${row}) th.govuk-table__header a`)
      .click()
  }
}

export { RegulatorHomePage }
