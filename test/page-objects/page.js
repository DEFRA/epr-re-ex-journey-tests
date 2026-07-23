import { checkDoubleClickPrevented } from '../support/double-click.js'

class Page {
  constructor(page) {
    this.page = page
  }

  open(path) {
    return this.page.goto(path)
  }

  async headingText() {
    return this.page.locator('h1.govuk-heading-xl').innerText()
  }

  async selectBackLink() {
    await this.page.locator('a', { hasText: 'Back' }).click()
  }

  async messageText() {
    return this.page.locator('#main-content > div > div > div').innerText()
  }

  async dashboardHeaderText() {
    return this.page.locator('#main-content > div > div > div > h1').innerText()
  }

  async wasteBalanceAmount() {
    return this.page.locator('[data-testid="waste-balance-amount"]').innerText()
  }

  async prnDetails() {
    const summaryRows = this.page.locator(
      'dl.govuk-summary-list:nth-of-type(1) > div.govuk-summary-list__row'
    )
    return await this.toDataMap(summaryRows)
  }

  async accreditationDetails() {
    const summaryRows = this.page.locator(
      'dl.govuk-summary-list:nth-of-type(2) > div.govuk-summary-list__row'
    )
    return await this.toDataMap(summaryRows)
  }

  async toDataMap(rowsLocator) {
    const dataMap = {}
    const count = await rowsLocator.count()

    for (let i = 0; i < count; i++) {
      const row = rowsLocator.nth(i)
      const key = await row.locator('.govuk-summary-list__key').innerText()
      const value = await row.locator('.govuk-summary-list__value').innerText()
      dataMap[key] = value
    }
    return dataMap
  }

  async signOut() {
    await this.page.locator('a', { hasText: 'Sign out' }).click()
  }

  async submit(selector = 'button[type=submit]') {
    await this.page.locator(selector).click()
  }

  async submitAndCheckDoubleClickPrevented(
    selector = 'button[type=submit]',
    options
  ) {
    await checkDoubleClickPrevented(this.page, selector, options)
  }

  // Shared by the various GOV.UK "confirmation panel" pages (PRN created /
  // issued / cancelled, summary log upload) which all render this link.
  async returnToHomePage() {
    await this.page.locator('a', { hasText: 'Return to home' }).click()
  }

  async panelDetailText() {
    return this.page
      .locator('#main-content > div > div > div > div > strong')
      .innerText()
  }

  async goToPrnsPage() {
    await this.page.locator('a', { hasText: 'PRNs page' }).click()
  }

  async goToPernsPage() {
    await this.page.locator('a', { hasText: 'PERNs page' }).click()
  }

  // Reads a single row of a header-driven GOV.UK table into a Map keyed by
  // column header text.
  async readGovukTableRow(tableSelector, rowIndex) {
    const tableRow = new Map()
    const headerText = await this.page
      .locator(`${tableSelector} > thead > tr th`)
      .allInnerTexts()
    const rowText = await this.page
      .locator(`${tableSelector} > tbody > tr:nth-child(${rowIndex}) td`)
      .allInnerTexts()
    for (let i = 0; i < headerText.length; i++) {
      tableRow.set(headerText[i], rowText[i])
    }
    return tableRow
  }

  // Reads every row of a GOV.UK table into plain objects using a fixed
  // column-name -> nth-child(cellIndex) map, for tables read by position
  // rather than by header text.
  async readGovukTableRows(tableSelector, columns) {
    const rows = this.page.locator(`${tableSelector} tbody tr`)
    const count = await rows.count()
    const data = []
    for (let i = 0; i < count; i++) {
      const row = rows.nth(i)
      const record = {}
      for (const [key, cellIndex] of Object.entries(columns)) {
        record[key] = await row
          .locator(`td:nth-child(${cellIndex})`)
          .innerText()
      }
      data.push(record)
    }
    return data
  }
}

export { Page }
