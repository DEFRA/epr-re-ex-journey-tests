class DefraIdStubPage {
  constructor(page) {
    this.page = page
  }

  async loginViaEmail(email) {
    await this.page.locator('#email').fill(email)
    await this.page.locator('button[type=submit]').click()
  }
}

export { DefraIdStubPage }
