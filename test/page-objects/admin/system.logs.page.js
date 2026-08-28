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

  // Hand-written markup rather than the govukButton macro, so it's a plain
  // link (no role="button") despite the button-styled classes.
  async clearSearch() {
    await this.page
      .getByRole('link', { name: 'Clear search', exact: true })
      .click()
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

  // Reads the "User ID" value from the most recent system log result card,
  // matched by its key text rather than position (see logCardField below).
  async firstResultUserId() {
    const card = this.page
      .locator('#main-content div.govuk-summary-card')
      .first()
    return this.logCardField(card, 'User ID')
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
    // .count() below reads the DOM as-is with no auto-wait, so without this
    // the search results can be read mid-navigation (searchFor's submit
    // triggers a full page load) - seen as an intermittent "log not found"
    // result in CI even when the log exists.
    await this.page
      .locator('#referenceNumber')
      .waitFor({ state: 'visible', timeout: 10000 })

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
    // .count() below reads the DOM as-is with no auto-wait (unlike .innerText()
    // elsewhere in this file), so without this a fresh search result can be
    // read before it has rendered any rows.
    await rows.first().waitFor({ state: 'visible', timeout: 10000 })
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
