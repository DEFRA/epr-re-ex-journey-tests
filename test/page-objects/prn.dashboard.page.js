import { Page } from 'page-objects/page'

class PRNDashboardPage extends Page {
  async selectAwaitingLink(index, tableIndex = 1) {
    await this.page
      .locator(
        `#awaiting-action table.govuk-table:nth-of-type(${tableIndex}) tr:nth-child(` +
          index +
          ') a.govuk-link'
      )
      .click()
  }

  async selectIssuedLink(index) {
    await this.page
      .locator(
        '#issued table.govuk-table tr:nth-child(' + index + ') a.govuk-link'
      )
      .click()
  }

  async selectCancelledLink(index) {
    await this.page
      .locator(
        '#cancelled table.govuk-table tr:nth-child(' + index + ') a.govuk-link'
      )
      .click()
  }

  async selectIssuedTab() {
    await this.page.locator('//a[normalize-space()="Issued"]').click()
  }

  async selectCancelledTab() {
    await this.page.locator('//a[normalize-space()="Cancelled"]').click()
  }

  // Index changes depending on whether PRN cancellation / PRN awaiting authorisation exists
  async getTableHeading(index = 1) {
    return this.page
      .locator(`#awaiting-action > h2.govuk-heading-m:nth-of-type(${index})`)
      .innerText()
  }

  async getCancelledRow(rowIndex) {
    return this.getTableRow('#cancelled', rowIndex)
  }

  async getTableRow(tableId, rowIndex) {
    return this.readGovukTableRow(`${tableId} table.govuk-table`, rowIndex)
  }

  async getIssuedRow(rowIndex) {
    return this.getTableRow('#issued', rowIndex)
  }

  async selectAwaitingActionTab() {
    await this.page.locator('//a[normalize-space()="Awaiting action"]').click()
  }

  // Depending on whether PRN cancellation / PRN awaiting authorisation exists, the table index might change / shift accordingly
  async getAwaitingRow(rowIndex, tableIndex = 1) {
    return this.readGovukTableRow(
      `#awaiting-action table.govuk-table:nth-of-type(${tableIndex})`,
      rowIndex
    )
  }

  async cancelHintText() {
    return this.page.locator('#main-content div.govuk-inset-text').innerText()
  }

  async selectPrnHeadingText() {
    return this.page.locator('#main-content > div > div > h2').innerText()
  }

  async getNoPrnMessage() {
    return this.page.locator('#awaiting-action > p').innerText()
  }

  async getNoIssuedPrnMessage() {
    return this.page.locator('#issued > p').innerText()
  }

  async getNoCreatedPrnMessage() {
    return this.page.locator('#main-content > div > div > p').innerText()
  }

  async createAPrnButton() {
    await this.page
      .locator(
        '#main-content div.epr-heading-with-action > a[data-module="govuk-button"]'
      )
      .click()
  }
}

export { PRNDashboardPage }
