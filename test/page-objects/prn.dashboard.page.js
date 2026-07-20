import { $, $$ } from '@wdio/globals'

class PRNDashboardPage {
  async dashboardHeaderText() {
    return $('#main-content > div > div > div > h1').getText()
  }

  async selectAwaitingLink(index, tableIndex = 1) {
    const linkElement = await $(
      `#awaiting-action table.govuk-table:nth-of-type(${tableIndex}) tr:nth-child(` +
        index +
        ') a.govuk-link'
    )
    await linkElement.waitForExist({ timeout: 5000 })
    await linkElement.click()
  }

  async selectIssuedLink(index) {
    const linkElement = await $(
      '#issued table.govuk-table tr:nth-child(' + index + ') a.govuk-link'
    )
    await linkElement.waitForExist({ timeout: 5000 })
    await linkElement.click()
  }

  async selectCancelledLink(index) {
    const linkElement = await $(
      '#cancelled table.govuk-table tr:nth-child(' + index + ') a.govuk-link'
    )
    await linkElement.waitForExist({ timeout: 5000 })
    await linkElement.click()
  }

  async selectIssuedTab() {
    await $('//a[normalize-space()="Issued"]').click()
  }

  async selectCancelledTab() {
    await $('//a[normalize-space()="Cancelled"]').click()
  }

  // Index changes depending on whether PRN cancellation / PRN awaiting authorisation exists
  async getTableHeading(index = 1) {
    return await $(
      `#awaiting-action > h2.govuk-heading-m:nth-of-type(${index})`
    ).getText()
  }

  async getCancelledRow(rowIndex) {
    return await this.getTableRow('#cancelled', rowIndex)
  }

  async getTableRow(tableId, rowIndex) {
    const tableRow = new Map()
    const tableHeaders = await $$(
      `${tableId} table.govuk-table > thead > tr th`
    )
    const headerText = await tableHeaders.map((element) => {
      return element.getText()
    })

    const tableData = await $$(
      `${tableId} table.govuk-table > tbody > tr:nth-child(${rowIndex}) td`
    )

    const rowText = await tableData.map((element) => {
      return element.getText()
    })

    for (let i = 0; i < headerText.length; i++) {
      tableRow.set(headerText[i], rowText[i])
    }
    return tableRow
  }

  async getIssuedRow(rowIndex) {
    return await this.getTableRow('#issued', rowIndex)
  }

  async selectAwaitingActionTab() {
    await $('//a[normalize-space()="Awaiting action"]').click()
  }

  // Depending on whether PRN cancellation / PRN awaiting authorisation exists, the table index might change / shift accordingly
  async getAwaitingRow(rowIndex, tableIndex = 1) {
    const authRow = new Map()
    const tableHeaders = await $$(
      `#awaiting-action table.govuk-table:nth-of-type(${tableIndex}) > thead > tr th`
    )
    const headerText = await tableHeaders.map((element) => {
      return element.getText()
    })

    const tableData = await $$(
      `#awaiting-action table.govuk-table:nth-of-type(${tableIndex}) > tbody > tr:nth-child(` +
        rowIndex +
        ') td'
    )

    const rowText = await tableData.map((element) => {
      return element.getText()
    })

    for (let i = 0; i < headerText.length; i++) {
      authRow.set(headerText[i], rowText[i])
    }
    return authRow
  }

  async cancelHintText() {
    return await $('#main-content div.govuk-inset-text').getText()
  }

  async selectPrnHeadingText() {
    return await $('#main-content > div > div > h2').getText()
  }

  async getNoPrnMessage() {
    return await $('#awaiting-action > p').getText()
  }

  async getNoIssuedPrnMessage() {
    return await $('#issued > p').getText()
  }

  async getNoCreatedPrnMessage() {
    return await $('#main-content > div > div > p').getText()
  }

  async wasteBalanceAmount() {
    const element = await $('[data-testid="waste-balance-amount"]')
    await element.waitForExist({ timeout: 5000 })
    return await element.getText()
  }

  async selectBackLink() {
    await $('a*=Back').click()
  }

  async createAPrnButton() {
    await $(
      '#main-content div.epr-heading-with-action > a[data-module="govuk-button"]'
    ).click()
  }
}

export default new PRNDashboardPage()
