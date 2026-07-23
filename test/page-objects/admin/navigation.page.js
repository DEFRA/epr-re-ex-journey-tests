class Navigation {
  constructor(page) {
    this.page = page
  }

  async clickOnLink(linkText) {
    const escaped = linkText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    await this.page
      .locator('#navigation li a', { hasText: new RegExp(`^${escaped}$`) })
      .click()
  }
}

export { Navigation }
