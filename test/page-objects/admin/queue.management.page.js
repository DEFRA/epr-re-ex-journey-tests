import { AdminPage } from 'page-objects/admin/page'

class QueueManagementPage extends AdminPage {
  open() {
    return super.open('/queue-management')
  }

  async getHeaderText() {
    return this.page.locator('h1').innerText()
  }

  async getMessageCount() {
    const text = await this.page.locator('p').innerText()
    const match = text.match(/(\d+) messages?/)
    return match ? Number(match[1]) : null
  }

  async getEmptyStateText() {
    const texts = await this.page.locator('#main-content p').allInnerTexts()
    return texts.find((t) => t.includes('no messages'))
  }

  async getTableHeaders() {
    return this.page.locator('table thead th').allInnerTexts()
  }

  async getFirstRowData() {
    const texts = await this.page
      .locator('table tbody tr:first-child td')
      .allInnerTexts()
    return {
      commandType: texts[0],
      sentTimestamp: texts[1],
      receiveCount: texts[2]
    }
  }

  async expandRawMessage() {
    await this.page.locator('table tbody details summary').click()
  }

  async getRawMessageBody() {
    return this.page
      .locator('table tbody details .app-json-display')
      .innerText()
  }

  async clickClearAllMessages() {
    await this.page
      .locator('a.govuk-button--warning, button.govuk-button--warning')
      .click()
  }

  async clearAllMessagesButtonExists() {
    return (
      (await this.page
        .locator('a.govuk-button--warning, button.govuk-button--warning')
        .count()) > 0
    )
  }

  async getConfirmHeading() {
    return this.page.locator('h1').innerText()
  }

  async confirmClear() {
    await this.page.locator('button[type=submit]').click()
  }

  async getSuccessBannerText() {
    return this.page
      .locator(
        '.govuk-notification-banner--success .govuk-notification-banner__content'
      )
      .innerText()
  }
}

export { QueueManagementPage }
