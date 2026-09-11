import { AdminPage } from 'page-objects/admin/page'

// The events page renders a single GOV.UK table under the main wrapper. It
// carries no data-testid, so it is reached through the wrapper the govuk
// template gives every admin page.
const EVENTS_TABLE = '#main-content table.govuk-table'

class WasteBalanceEventsPage extends AdminPage {
  /**
   * Every event the page holds, each row keyed by its column heading. The wait
   * settles on the first row, so a page that rendered no rows fails here rather
   * than returning an empty list a caller could read as a pass.
   *
   * @returns {Promise<Map<string, string>[]>}
   */
  async eventRows() {
    const rows = this.page.locator(`${EVENTS_TABLE} > tbody > tr`)
    await rows.first().waitFor({ state: 'visible' })

    const count = await rows.count()
    const events = []
    for (let index = 1; index <= count; index++) {
      events.push(await this.readGovukTableRow(EVENTS_TABLE, index))
    }
    return events
  }
}

export { WasteBalanceEventsPage }
