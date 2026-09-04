import { Page } from 'page-objects/page'

const LEDGER_TABLE = '#main-content table.govuk-table'

class WasteBalanceLedgerPage extends Page {
  /**
   * The caption above the heading. It names the accreditation the balance
   * belongs to, or says the balance is registered-only, so it is the only
   * thing on the page that identifies which ledger a regulator is reading.
   *
   * @returns {Promise<string>}
   */
  async captionText() {
    return this.page.locator('h1 .govuk-caption-xl').innerText()
  }

  /**
   * Every event the ledger holds, newest first, each row keyed by its column
   * heading. The wait settles on the first row, so a ledger that rendered no
   * rows fails here rather than returning an empty list a caller could read
   * as a pass.
   *
   * @returns {Promise<Map<string, string>[]>}
   */
  async eventRows() {
    const rows = this.page.locator(`${LEDGER_TABLE} > tbody > tr`)
    await rows.first().waitFor({ state: 'visible' })

    const count = await rows.count()
    const events = []
    for (let index = 1; index <= count; index++) {
      events.push(await this.readGovukTableRow(LEDGER_TABLE, index))
    }
    return events
  }

  /**
   * The way into a note, from every row that moved the balance because of it.
   * Each of those links reads the same to the eye, so the note's number is
   * what tells one from another - to a reader of the page as much as to this.
   *
   * @param {string} prnNumber
   * @returns {import('@playwright/test').Locator}
   */
  viewNoteLinks(prnNumber) {
    return this.page.getByRole('link', { name: `View PRN ${prnNumber}` })
  }

  /**
   * Every way into a note the ledger offers, whichever note it is. A row that
   * moved the balance for something other than a note offers none, so the
   * count says which rows carry one.
   *
   * @returns {import('@playwright/test').Locator}
   */
  allViewNoteLinks() {
    return this.page.getByRole('link', { name: /^View PRN/ })
  }
}

export { WasteBalanceLedgerPage }
