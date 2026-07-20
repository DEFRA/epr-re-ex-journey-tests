import { browser, $, $$ } from '@wdio/globals'

class DashboardPage {
  open(orgId) {
    return browser.url(`/organisations/${orgId}`)
  }

  async dashboardHeaderText() {
    return $('#main-content > div > div > div > h1').getText()
  }

  async selectLink(index) {
    const linkElement = await $(
      '#main-content table.govuk-table tr:nth-child(' + index + ') a.govuk-link'
    )
    await linkElement.waitForExist({ timeout: 10000 })
    await linkElement.click()
  }

  async selectTableLink(tableIndex, index) {
    const linkElement = await $(
      '#main-content table.govuk-table:nth-of-type(' +
        tableIndex +
        ') tr:nth-child(' +
        index +
        ') a.govuk-link'
    )
    await linkElement.waitForExist({ timeout: 10000 })
    await linkElement.click()
  }

  async availableWasteBalance(index) {
    const wasteBalanceElement = await $(
      '#main-content table.govuk-table tr:nth-child(' +
        index +
        ') > td.govuk-table__cell.govuk-table__cell--numeric'
    )
    await wasteBalanceElement.waitForExist({ timeout: 10000 })
    return await wasteBalanceElement.getText()
  }

  async selectExportingTab() {
    await $('//a[normalize-space()="Exporting"]').click()
  }

  async getMaterial(tableIndex, rowIndex) {
    const materialElement = await $(
      '#main-content table.govuk-table:nth-of-type(' +
        tableIndex +
        ') tr:nth-child(' +
        rowIndex +
        ') > td:nth-child(1)'
    )
    await materialElement.waitForExist({ timeout: 10000 })
    return await materialElement.getText()
  }

  async getRegistrationStatus(tableIndex, rowIndex) {
    const registrationElement = await $(
      '#main-content table.govuk-table:nth-of-type(' +
        tableIndex +
        ') tr:nth-child(' +
        rowIndex +
        ') > td:nth-child(2)'
    )
    await registrationElement.waitForExist({ timeout: 10000 })
    return await registrationElement.getText()
  }

  async getAccreditationStatus(tableIndex, rowIndex) {
    const accreditationElement = await $(
      '#main-content table.govuk-table:nth-of-type(' +
        tableIndex +
        ') tr:nth-child(' +
        rowIndex +
        ') > td:nth-child(3)'
    )
    await accreditationElement.waitForExist({ timeout: 10000 })
    return await accreditationElement.getText()
  }

  async getNumberOfRows(tableIndex) {
    const rows = await $$(
      '#main-content table.govuk-table:nth-of-type(' + tableIndex + ') tbody tr'
    )
    return rows.length
  }

  async getTableRow(tableIndex, rowIndex) {
    const tableRow = new Map()
    const selector = `#main-content table.govuk-table:nth-of-type(${tableIndex})`
    const tableHeaders = await $$(`${selector} > thead > tr th`)
    const headerText = await tableHeaders.map((el) => el.getText())
    const tableData = await $$(
      `${selector} > tbody > tr:nth-child(${rowIndex}) td`
    )
    const rowText = await tableData.map((el) => el.getText())
    for (let i = 0; i < headerText.length; i++) {
      tableRow.set(headerText[i], rowText[i])
    }
    return tableRow
  }

  async selectBackLink() {
    await $('a*=Back').click()
  }
}

export default new DashboardPage()
