import { AdminPage } from 'page-objects/admin/page'
import { $, $$ } from '@wdio/globals'

class QueueManagementPage extends AdminPage {
  open() {
    return super.open('/queue-management')
  }

  async getHeaderText() {
    const heading = await $('h1')
    return heading.getText()
  }

  async getMessageCount() {
    const text = await $('p').getText()
    const match = text.match(/(\d+) messages?/)
    return match ? Number(match[1]) : null
  }

  async getEmptyStateText() {
    const paragraphs = await $$('#main-content p')
    const texts = await Promise.all([...paragraphs].map((p) => p.getText()))
    return texts.find((t) => t.includes('no messages'))
  }

  async getTableHeaders() {
    const headers = await $$('table thead th')
    return Promise.all([...headers].map((th) => th.getText()))
  }

  async getFirstRowData() {
    const cells = await $$('table tbody tr:first-child td')
    const texts = await Promise.all([...cells].map((td) => td.getText()))
    return {
      commandType: texts[0],
      sentTimestamp: texts[1],
      receiveCount: texts[2]
    }
  }

  async expandRawMessage() {
    const details = await $('table tbody details summary')
    await details.click()
  }

  async getRawMessageBody() {
    const code = await $('table tbody details .app-json-display')
    await code.waitForDisplayed()
    return code.getText()
  }

  async clickClearAllMessages() {
    const button = await $(
      'a.govuk-button--warning, button.govuk-button--warning'
    )
    await button.click()
  }

  async clearAllMessagesButtonExists() {
    const button = await $(
      'a.govuk-button--warning, button.govuk-button--warning'
    )
    return await button.isExisting()
  }

  async getConfirmHeading() {
    const heading = await $('h1')
    return heading.getText()
  }

  async confirmClear() {
    const button = await $('button[type=submit]')
    await button.click()
  }

  async getSuccessBannerText() {
    const banner = await $(
      '.govuk-notification-banner--success .govuk-notification-banner__content'
    )
    await banner.waitForDisplayed()
    return banner.getText()
  }
}

export default new QueueManagementPage()
