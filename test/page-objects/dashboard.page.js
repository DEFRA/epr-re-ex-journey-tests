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

  async getTableCell(tableIndex, rowIndex, cellIndex) {
    return this.page
      .locator(
        `#main-content table.govuk-table:nth-of-type(${tableIndex}) tr:nth-child(${rowIndex}) > td:nth-child(${cellIndex})`
      )
      .innerText()
  }

  async getMaterial(tableIndex, rowIndex) {
    return this.getTableCell(tableIndex, rowIndex, 1)
  }

  async getRegistrationStatus(tableIndex, rowIndex) {
    return this.getTableCell(tableIndex, rowIndex, 2)
  }

  async getAccreditationStatus(tableIndex, rowIndex) {
    return this.getTableCell(tableIndex, rowIndex, 3)
  }

  async getTableRow(tableIndex, rowIndex) {
    return this.readGovukTableRow(
      `#main-content table.govuk-table:nth-of-type(${tableIndex})`,
      rowIndex
    )
  }
}

export { DashboardPage }
