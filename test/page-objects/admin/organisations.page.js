import { AdminPage } from 'page-objects/admin/page'

class OrganisationsPage extends AdminPage {
  open() {
    return super.open('/organisations')
  }

  async getTableData() {
    const rows = this.page.locator('table.govuk-table tbody tr')
    const count = await rows.count()
    const data = []

    for (let i = 0; i < count; i++) {
      const row = rows.nth(i)
      data.push({
        header: await row.locator('th.govuk-table__header').innerText(),
        orgId: await row.locator('td:nth-child(2)').innerText(),
        regNo: await row.locator('td:nth-child(3)').innerText(),
        regulator: await row.locator('td:nth-child(4)').innerText(),
        status: await row.locator('td:nth-child(5)').innerText()
      })
    }

    return data
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
        `#main-content > div > div > div > table > tbody > tr:nth-child(${row}) > td:nth-child(6) > a:nth-of-type(2)`
      )
      .click()
  }

  async searchFor(orgName) {
    await this.page.locator('#search').fill(orgName)
    await this.page.locator('button[type=submit]').click()
  }

  async searchResult() {
    return this.page
      .locator('#main-content > div:nth-child(2) > div > div > h2')
      .innerText()
  }

  async getSuccessMessage() {
    return this.page.locator('#organisation-success-message').innerText()
  }

  async clearSearch() {
    await this.page
      .locator(
        '#main-content > div:nth-child(1) > div > form > div.govuk-button-group > a'
      )
      .click()
  }

  async getPermissionText() {
    return this.page.locator('#main-content > div > div > p').innerText()
  }
}

export { OrganisationsPage }
