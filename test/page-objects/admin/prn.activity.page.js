import { AdminPage } from 'page-objects/admin/page'

class PrnActivityPage extends AdminPage {
  open() {
    return super.open('/prn-activity')
  }

  tableText() {
    return this.page.locator('table.govuk-table').innerText()
  }

  cancelLink(prnNumber) {
    return this.page.getByRole('link', { name: `Cancel PRN ${prnNumber}` })
  }

  // Pages forward (oldest first) to the PRN's row, keyed by column header.
  // The PRN number is the row's <th>, so cells are read from th and td.
  // Cost grows with the environment's PRN history; for a large one, prefer
  // the registration overview's per-accreditation PRN activity download.
  async rowFor(prnNumber) {
    const headers = (
      await this.page.locator('table.govuk-table thead th').allInnerTexts()
    ).map((header) => header.trim())
    const visited = new Set()

    for (;;) {
      const row = this.page.locator('table.govuk-table tbody tr').filter({
        has: this.page.locator('th', {
          hasText: new RegExp(`^${prnNumber}$`)
        })
      })
      if ((await row.count()) > 0) {
        const cells = await row.first().locator('th, td').allInnerTexts()
        return Object.fromEntries(
          headers.map((header, index) => [header, cells[index]?.trim()])
        )
      }

      const next = this.page.locator('.govuk-pagination__next a')
      if ((await next.count()) === 0) {
        throw new Error(`${prnNumber} not found in PRN activity`)
      }
      // goto waits for the page to load; a click only waits for it to start.
      // A missing or repeated href would otherwise reload pages until timeout.
      const href = await next.getAttribute('href')
      if (!href || visited.has(href)) {
        throw new Error(
          `${prnNumber} not found in PRN activity (pagination stopped at ${href})`
        )
      }
      visited.add(href)
      await this.page.goto(new URL(href, this.page.url()).toString())
    }
  }

  // /prn-activity/download is a plain GET link (not the crumb-POST form
  // pattern the other report pages use), so fetch it directly rather than
  // going through AdminPage.fetchCsv.
  async fetchCsv() {
    return this.page.evaluate(async () => {
      const response = await fetch('/prn-activity/download', {
        credentials: 'same-origin'
      })
      return {
        status: response.status,
        contentDisposition: response.headers.get('content-disposition'),
        contentType: response.headers.get('content-type'),
        body: await response.text()
      }
    })
  }
}

export { PrnActivityPage }
