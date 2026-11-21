import { AdminPage } from 'page-objects/admin/page'

class PrnTonnagePage extends AdminPage {
  openResults() {
    return super.open('/prn-tonnage/results')
  }

  /**
   * The results row for an accreditation, keyed by column header.
   *
   * @param {string} accreditationNumber
   * @returns {Promise<Record<string, string>>}
   */
  async rowFor(accreditationNumber) {
    const table = this.page.getByRole('table', {
      name: 'PRN tonnage by accreditation'
    })
    await table.waitFor({ state: 'visible', timeout: 10000 })

    const headers = (await table.locator('thead th').allInnerTexts()).map(
      (header) => header.trim()
    )
    const row = table.locator('tbody tr').filter({
      has: this.page.getByRole('cell', {
        name: accreditationNumber,
        exact: true
      })
    })
    if ((await row.count()) === 0) {
      throw new Error(`${accreditationNumber} not found in PRN tonnage`)
    }
    const cells = await row.first().locator('th, td').allInnerTexts()
    return Object.fromEntries(
      headers.map((header, index) => [header, cells[index]?.trim()])
    )
  }
}

export { PrnTonnagePage }
