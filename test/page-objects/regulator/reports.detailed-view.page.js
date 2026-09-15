import { Page } from 'page-objects/page'

const REPORTS_TABLE = '#main-content table[data-testid="reports-table"]'

/**
 * The regulator's view of every report an accreditation holds, where the
 * accreditation page shows only the most recent.
 */
class ReportsDetailedViewPage extends Page {
  /**
   * The page itself, so a journey can tell it from the accreditation's summary.
   * @returns {import('@playwright/test').Locator}
   */
  detailedView() {
    return this.page.locator(
      '#main-content [data-testid="reports-detailed-view"]'
    )
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
  async reportHeadings() {
    return this.page.locator(`${REPORTS_TABLE} > thead > tr th`).allInnerTexts()
  }

  /**
   * Every reports row, keyed by column heading. The wait settles on the first
   * row, so a page that rendered none fails here rather than answering with an
   * empty list a caller could read as a pass.
   * @returns {Promise<Map<string, string>[]>}
   */
  async reports() {
    const rows = this.page.locator(`${REPORTS_TABLE} > tbody > tr`)
    await rows.first().waitFor({ state: 'visible' })

    const count = await rows.count()
    const reports = []
    for (let index = 1; index <= count; index++) {
      reports.push(await this.readGovukTableRow(REPORTS_TABLE, index))
    }
    return reports
  }

  /**
   * @returns {Promise<number>}
   */
  async changeControlCount() {
    return this.page.locator('#main-content button, #main-content form').count()
  }
}

export { ReportsDetailedViewPage }
