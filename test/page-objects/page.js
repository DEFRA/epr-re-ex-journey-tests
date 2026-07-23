class Page {
  constructor(page) {
    this.page = page
  }

  open(path) {
    return this.page.goto(path)
  }

  async headingText() {
    return this.page.locator('h1.govuk-heading-xl').innerText()
  }

  async selectBackLink() {
    await this.page.locator('a', { hasText: 'Back' }).click()
  }

  async messageText() {
    return this.page.locator('#main-content > div > div > div').innerText()
  }

  async dashboardHeaderText() {
    return this.page.locator('#main-content > div > div > div > h1').innerText()
  }

  async wasteBalanceAmount() {
    return this.page.locator('[data-testid="waste-balance-amount"]').innerText()
  }

  async prnDetails() {
    const summaryRows = this.page.locator(
      'dl.govuk-summary-list:nth-of-type(1) > div.govuk-summary-list__row'
    )
    return await this.toDataMap(summaryRows)
  }

  async accreditationDetails() {
    const summaryRows = this.page.locator(
      'dl.govuk-summary-list:nth-of-type(2) > div.govuk-summary-list__row'
    )
    return await this.toDataMap(summaryRows)
  }

  async toDataMap(rowsLocator) {
    const dataMap = {}
    const count = await rowsLocator.count()

    for (let i = 0; i < count; i++) {
      const row = rowsLocator.nth(i)
      const key = await row.locator('.govuk-summary-list__key').innerText()
      const value = await row.locator('.govuk-summary-list__value').innerText()
      dataMap[key] = value
    }
    return dataMap
  }

  async signOut() {
    await this.page.locator('a', { hasText: 'Sign out' }).click()
  }
}

export { Page }
