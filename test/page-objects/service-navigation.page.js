// The band epr-frontend renders above every page: the service name, where
// that name links to, and the navigation beside it. Which one of these a user
// gets is decided by their role, so both populations read it through the same
// object.
class ServiceNavigation {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    this.page = page
  }

  async serviceName() {
    return this.page
      .locator('.govuk-service-navigation__service-name')
      .innerText()
  }

  async serviceUrl() {
    return this.page
      .locator('.govuk-service-navigation__service-name a')
      .getAttribute('href')
  }

  // The tab the service navigation marks as the page being read. GOV.UK sets
  // aria-current="page" on it, so that is what a screen reader hears and what
  // the underline draws from.
  async currentLinkText() {
    return this.page.locator('#navigation a[aria-current="page"]').innerText()
  }

  // Read from the list item rather than the link inside it, because an item
  // whose destination is unset renders as text instead of a link.
  async linkTexts() {
    const texts = await this.page.locator('#navigation li').allInnerTexts()
    return texts.map((text) => text.trim())
  }
}

export { ServiceNavigation }
