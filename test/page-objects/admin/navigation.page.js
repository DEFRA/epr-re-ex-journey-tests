class Navigation {
  constructor(page) {
    this.page = page
  }

  async clickOnLink(linkText) {
    await this.page.getByRole('link', { name: linkText, exact: true }).click()
  }
}

export { Navigation }
