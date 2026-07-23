import { Page } from 'page-objects/page'

class DashboardPage extends Page {
  open(orgId) {
    return this.page.goto(`/organisations/${orgId}`)
  }

  async selectLink(index) {
    await this.page
      .locator(
        '#main-content table.govuk-table tr:nth-child(' +
          index +
          ') a.govuk-link'
      )
      .click()
  }

  async selectTableLink(tableIndex, index) {
    await this.page
      .locator(
        '#main-content table.govuk-table:nth-of-type(' +
          tableIndex +
          ') tr:nth-child(' +
          index +
          ') a.govuk-link'
      )
      .click()
  }

  async availableWasteBalance(index) {
    return this.page
      .locator(
        '#main-content table.govuk-table tr:nth-child(' +
          index +
          ') > td.govuk-table__cell.govuk-table__cell--numeric'
      )
      .innerText()
  }

  async selectExportingTab() {
    await this.page.locator('//a[normalize-space()="Exporting"]').click()
  }

  async getMaterial(tableIndex, rowIndex) {
    return this.page
      .locator(
        '#main-content table.govuk-table:nth-of-type(' +
          tableIndex +
          ') tr:nth-child(' +
          rowIndex +
          ') > td:nth-child(1)'
      )
      .innerText()
  }

  async getRegistrationStatus(tableIndex, rowIndex) {
    return this.page
      .locator(
        '#main-content table.govuk-table:nth-of-type(' +
          tableIndex +
          ') tr:nth-child(' +
          rowIndex +
          ') > td:nth-child(2)'
      )
      .innerText()
  }

  async getAccreditationStatus(tableIndex, rowIndex) {
    return this.page
      .locator(
        '#main-content table.govuk-table:nth-of-type(' +
          tableIndex +
          ') tr:nth-child(' +
          rowIndex +
          ') > td:nth-child(3)'
      )
      .innerText()
  }

  async getTableRow(tableIndex, rowIndex) {
    const tableRow = new Map()
    const selector = `#main-content table.govuk-table:nth-of-type(${tableIndex})`
    const headerText = await this.page
      .locator(`${selector} > thead > tr th`)
      .allInnerTexts()
    const rowText = await this.page
      .locator(`${selector} > tbody > tr:nth-child(${rowIndex}) td`)
      .allInnerTexts()
    for (let i = 0; i < headerText.length; i++) {
      tableRow.set(headerText[i], rowText[i])
    }
    return tableRow
  }
}

export { DashboardPage }
