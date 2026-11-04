import { AdminPage } from 'page-objects/admin/page'

/**
 * The criteria the search form accepts. Every key is the id and the name of the
 * field it fills, and every filled field narrows the results further.
 *
 * @typedef {{
 *   search?: string,
 *   organisationNumber?: string,
 *   registrationNumber?: string,
 *   accreditationNumber?: string
 * }} SearchCriteria
 */

/**
 * The search fields in the order they appear on the form.
 *
 * @type {Array<keyof SearchCriteria>}
 */
const SEARCH_FIELD_IDS = [
  'search',
  'organisationNumber',
  'registrationNumber',
  'accreditationNumber'
]

// The "n results found" heading, rendered only when a search was made.
const SEARCH_RESULT_HEADING = '[data-testid="app-page-body"] h2'

const TABLE_ROWS = 'table.govuk-table tbody tr'

class OrganisationsPage extends AdminPage {
  open() {
    return super.open('/organisations')
  }

  async getTableData() {
    const rows = this.page.locator(TABLE_ROWS)
    const count = await rows.count()
    const data = []

    for (let i = 0; i < count; i++) {
      const row = rows.nth(i)
      data.push({
        header: await row.locator('th.govuk-table__header').innerText(),
        orgId: await row.locator('td:nth-child(2)').innerText(),
        regAccNumbers: await row.locator('td:nth-child(3)').innerText(),
        regulator: await row.locator('td:nth-child(4)').innerText(),
        status: await row.locator('td:nth-child(5)').innerText()
      })
    }

    return data
  }

  /**
   * How many organisations the table is showing. Cheaper than getTableData()
   * when only the size of the result set matters.
   *
   * @returns {Promise<number>}
   */
  async getTableRowCount() {
    return this.page.locator(TABLE_ROWS).count()
  }

  async viewLink(row) {
    await this.page
      .locator(
        `main table tbody tr:nth-child(${row}) td:nth-child(6) a:nth-of-type(1)`
      )
      .click()
  }

  async editLink(row) {
    await this.page
      .locator(
        `[data-testid="app-page-body"] table tbody tr:nth-child(${row}) td:nth-child(6) a:nth-of-type(2)`
      )
      .click()
  }

  /**
   * Searches on the given criteria. Fields left out are emptied rather than
   * ignored, so the search narrows on exactly what was passed even when the
   * page still shows the values of the previous search.
   *
   * @param {SearchCriteria} criteria
   * @returns {Promise<void>}
   */
  async searchBy(criteria) {
    for (const id of SEARCH_FIELD_IDS) {
      await this.page.locator(`#${id}`).fill(criteria[id] ?? '')
    }
    await this.page.locator('button[type=submit]').click()
  }

  /**
   * @param {string} orgName
   * @returns {Promise<void>}
   */
  async searchFor(orgName) {
    await this.searchBy({ search: orgName })
  }

  async searchResult() {
    return this.page.locator(SEARCH_RESULT_HEADING).innerText()
  }

  /**
   * Whether the page is showing search results at all. The unfiltered list
   * carries no result count.
   *
   * @returns {Promise<boolean>}
   */
  async searchResultExists() {
    return (await this.page.locator(SEARCH_RESULT_HEADING).count()) > 0
  }

  async getSuccessMessage() {
    return this.page.locator('#organisation-success-message').innerText()
  }
}

export { OrganisationsPage }
