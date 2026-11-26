import { AdminPage } from 'page-objects/admin/page'
import { parseCsvRows } from '../../support/csv.js'

class RegistrationYearPage extends AdminPage {
  reportsTable() {
    return this.page.locator('#reports table')
  }

  async getReportsTableData() {
    // .count() below reads the DOM as-is with no auto-wait, so without this
    // the table can be read before it's rendered - seen as an intermittent
    // 0-row result in CI.
    await this.page
      .locator('#reports table')
      .waitFor({ state: 'visible', timeout: 10000 })

    const rows = this.page.locator('#reports table tbody tr')
    const count = await rows.count()
    const data = []

    for (let i = 0; i < count; i++) {
      const row = rows.nth(i)
      const linkLocators = row.locator('td:nth-child(5) a')
      const linkCount = await linkLocators.count()
      const links = []
      for (let j = 0; j < linkCount; j++) {
        const link = linkLocators.nth(j)
        links.push({ text: await link.innerText() })
      }

      data.push({
        period: await row.locator('td:nth-child(1)').innerText(),
        submission: await row.locator('td:nth-child(2)').innerText(),
        due: await row.locator('td:nth-child(3)').innerText(),
        status: await row.locator('td:nth-child(4)').innerText(),
        actions: await row.locator('td:nth-child(5)').innerText(),
        links
      })
    }

    return data
  }

  /**
   * @param {string} key
   * @param {string} linkName
   * @returns {import('@playwright/test').Locator}
   */
  #summaryRowLink(key, linkName) {
    return this.page
      .locator('.govuk-summary-list__row', {
        has: this.page.locator('dt', { hasText: key })
      })
      .getByRole('link', { name: linkName, exact: true })
  }

  viewORSLink() {
    return this.#summaryRowLink('Overseas sites', 'View')
  }

  /** @returns {import('@playwright/test').Locator} */
  wasteBalanceEventsLink() {
    return this.#summaryRowLink('Waste balance events', 'View')
  }

  /** @returns {import('@playwright/test').Locator} */
  prnActivityDownloadLink() {
    return this.#summaryRowLink('PRN activity', 'Download')
  }

  /** @returns {import('@playwright/test').Locator} */
  wasteRecordsDownloadLink() {
    return this.#summaryRowLink('Waste records', 'Download')
  }

  /**
   * Downloads the year's waste records, one record per row keyed by column.
   *
   * @returns {Promise<{ failure: string | null, filename: string, records: Record<string, string>[] }>}
   */
  async downloadWasteRecords() {
    const { failure, filename, body } = await this.download(
      this.wasteRecordsDownloadLink()
    )
    return { failure, filename, records: parseCsvRows(body.toString('utf8')) }
  }

  // The actions cell renders <a>View</a><br><a>Unsubmit</a>, so the nth-child
  // indices below count the <br>: View is child 1 and Unsubmit is child 3.
  async clickOnViewReportLink(row) {
    await this.page
      .locator(
        `#reports > table > tbody > tr:nth-child(${row}) > td:nth-child(5) > a:nth-child(1)`
      )
      .click()
  }

  async clickOnUnsubmitReportLink(row) {
    await this.page
      .locator(
        `#reports > table > tbody > tr:nth-child(${row}) > td:nth-child(5) > a:nth-child(3)`
      )
      .click()
  }

  async getSummaryLogsContent() {
    return this.page.locator('#summary-logs').innerText()
  }

  // The summary-logs table Actions cell (3rd column) renders a View data and
  // a Download link; return both so a test can assert on the entry points
  // offered for a log.
  async getSummaryLogActionLinks(row) {
    const cell = this.page.locator(
      `#summary-logs table tbody tr:nth-child(${row}) td:nth-child(3)`
    )
    await cell.waitFor({ state: 'visible', timeout: 10000 })

    const links = cell.locator('a')
    const count = await links.count()
    const data = []
    for (let i = 0; i < count; i++) {
      const link = links.nth(i)
      data.push({ text: await link.innerText() })
    }
    return data
  }

  async getSummaryLogUploadedAt(row) {
    return this.page
      .locator(`#summary-logs table tbody tr:nth-child(${row}) td:nth-child(1)`)
      .innerText()
  }

  async clickViewSummaryLogData(row) {
    await this.page
      .locator(`#summary-logs table tbody tr:nth-child(${row}) td:nth-child(3)`)
      .getByRole('link', { name: 'View data' })
      .click()
  }
}

export { RegistrationYearPage }
