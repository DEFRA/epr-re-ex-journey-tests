import { Page } from 'page-objects/page'

const LEDGER_TABLE =
  '#main-content table[data-testid="waste-balance-ledger-table"]'

class WasteBalanceLedgerPage extends Page {
  /**
   * The heading the ledger sits under. It shares the accreditation page with
   * that page's own title and with the reports above it, so it is found by
   * what it says rather than by its level or its place on the page.
   *
   * @returns {import('@playwright/test').Locator}
   */
  heading() {
    return this.page.getByRole('heading', { name: 'Waste balance ledger' })
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
    return this.page.getByRole('link', { name: `View ${prnNumber}` })
  }

  /**
   * Where each row's action leads, in row order, and null for a row that
   * offers none. It reads the target rather than the link text, so it says
   * which row leads to which note instead of only that a link is there.
   *
   * @returns {Promise<(string | null)[]>}
   */
  async actionTargets() {
    return this.page
      .locator(`${LEDGER_TABLE} > tbody > tr > td:last-child`)
      .evaluateAll((cells) =>
        cells.map(
          (cell) => cell.querySelector('a')?.getAttribute('href') ?? null
        )
      )
  }
}

export { WasteBalanceLedgerPage }
