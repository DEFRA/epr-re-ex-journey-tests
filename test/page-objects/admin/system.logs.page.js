import { AdminPage } from 'page-objects/admin/page'
import { $, $$ } from '@wdio/globals'

class SystemLogsPage extends AdminPage {
  open() {
    return super.open('/system-logs')
  }

  async searchFor(orgName) {
    await $('#referenceNumber').setValue(orgName)
    await $('button[type=submit]').click()
  }

  async searchByUserId(userId) {
    await $('#userId').setValue(userId)
    await $('button[type=submit]').click()
  }

  async searchByUserIdAndEventType(userId, subCategory) {
    await $('#userId').setValue(userId)
    await $('#subCategory').selectByAttribute('value', subCategory)
    await $('button[type=submit]').click()
  }

  async searchByAllFilters(referenceNumber, userId, subCategory) {
    await $('#referenceNumber').setValue(referenceNumber)
    await $('#userId').setValue(userId)
    await $('#subCategory').selectByAttribute('value', subCategory)
    await $('button[type=submit]').click()
  }

  async searchResults() {
    return $('#main-content > div.govuk-summary-card')
  }

  async submitSearch() {
    await $('button[type=submit]').click()
  }

  async clearSearch() {
    await $('a.govuk-button--inverse').click()
  }

  async referenceNumberValue() {
    return await $('#referenceNumber').getValue()
  }

  async userIdValue() {
    return await $('#userId').getValue()
  }

  async eventTypeValue() {
    return await $('#subCategory').getValue()
  }

  // Reads the "User ID" value (the second summary-list row) from the most
  // recent system log result card.
  async firstResultUserId() {
    const userId = await $(
      '#main-content div.govuk-summary-card__content > dl > div:nth-child(2) > dd'
    ).getText()
    return userId.trim()
  }

  // Reads the "Difference" JSON from the most recent system log result card.
  // Matches the row by its key text rather than position, so it is unaffected
  // by rows being added to or removed from the summary list.
  async jsonDifference() {
    const card = await $('#main-content div.govuk-summary-card')
    return this.logCardField(card, 'Difference')
  }

  async noSystemLogsFound() {
    return await $('#main-content div.govuk-inset-text').getText()
  }

  async unlinkLogCard() {
    await $('#main-content .govuk-summary-card').waitForExist()
    const cards = await $$('#main-content .govuk-summary-card')
    for (const card of cards) {
      const title = await card.$('.govuk-summary-card__title').getText()
      if (title.includes('unlinked-from-defra-id-organisation')) {
        return card
      }
    }
    return null
  }

  async logCardField(card, keyText) {
    const rows = await card.$$('.govuk-summary-list__row')
    for (const row of rows) {
      const key = (await row.$('.govuk-summary-list__key').getText()).trim()
      if (key === keyText) {
        return (await row.$('.govuk-summary-list__value').getText()).trim()
      }
    }
    return null
  }
}

export default new SystemLogsPage()
