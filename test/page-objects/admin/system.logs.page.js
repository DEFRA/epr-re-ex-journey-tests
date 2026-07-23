import { AdminPage } from 'page-objects/admin/page'

class SystemLogsPage extends AdminPage {
  open() {
    return super.open('/system-logs')
  }

  async searchFor(orgName) {
    await this.page.locator('#referenceNumber').fill(orgName)
    await this.page.locator('button[type=submit]').click()
  }

  async searchByUserId(userId) {
    await this.page.locator('#userId').fill(userId)
    await this.page.locator('button[type=submit]').click()
  }

  async searchByUserIdAndEventType(userId, subCategory) {
    await this.page.locator('#userId').fill(userId)
    await this.page.locator('#subCategory').selectOption(subCategory)
    await this.page.locator('button[type=submit]').click()
  }

  async searchByAllFilters(referenceNumber, userId, subCategory) {
    await this.page.locator('#referenceNumber').fill(referenceNumber)
    await this.page.locator('#userId').fill(userId)
    await this.page.locator('#subCategory').selectOption(subCategory)
    await this.page.locator('button[type=submit]').click()
  }

  searchResults() {
    return this.page.locator('#main-content div.govuk-summary-card')
  }

  async submitSearch() {
    await this.page.locator('button[type=submit]').click()
  }

  async clearSearch() {
    await this.page.locator('a.govuk-button--inverse').click()
  }

  async referenceNumberValue() {
    return this.page.locator('#referenceNumber').inputValue()
  }

  async userIdValue() {
    return this.page.locator('#userId').inputValue()
  }

  async eventTypeValue() {
    return this.page.locator('#subCategory').inputValue()
  }

  // Reads the "User ID" value (the second summary-list row) from the most
  // recent system log result card.
  async firstResultUserId() {
    const userId = await this.page
      .locator(
        '#main-content div.govuk-summary-card__content > dl > div:nth-child(2) > dd'
      )
      .innerText()
    return userId.trim()
  }

  // Reads the "Difference" JSON from the most recent system log result card.
  // Matches the row by its key text rather than position, so it is unaffected
  // by rows being added to or removed from the summary list.
  async jsonDifference() {
    const card = this.page.locator('#main-content div.govuk-summary-card')
    return this.logCardField(card, 'Difference')
  }

  async noSystemLogsFound() {
    return this.page.locator('#main-content div.govuk-inset-text').innerText()
  }

  async unlinkLogCard() {
    const cards = this.page.locator('#main-content .govuk-summary-card')
    const count = await cards.count()
    for (let i = 0; i < count; i++) {
      const card = cards.nth(i)
      const title = await card.locator('.govuk-summary-card__title').innerText()
      if (title.includes('unlinked-from-defra-id-organisation')) {
        return card
      }
    }
    return null
  }

  async logCardField(card, keyText) {
    const rows = card.locator('.govuk-summary-list__row')
    const count = await rows.count()
    for (let i = 0; i < count; i++) {
      const row = rows.nth(i)
      const key = (
        await row.locator('.govuk-summary-list__key').innerText()
      ).trim()
      if (key === keyText) {
        return (
          await row.locator('.govuk-summary-list__value').innerText()
        ).trim()
      }
    }
    return null
  }
}

export { SystemLogsPage }
