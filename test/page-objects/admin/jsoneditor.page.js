class JsonEditor {
  constructor(page) {
    this.page = page
  }

  async switchToTextEditor() {
    await this.page
      .locator(
        '#jsoneditor > div > div.jsoneditor-menu > div.jsoneditor-modes > button'
      )
      .click()
    await this.page
      .locator(
        '#jsoneditor > div > div.jsoneditor-menu > div.jsoneditor-anchor > div > div > ul > li:nth-child(2) > button > div.jsoneditor-text'
      )
      .click()
  }

  async switchToTreeEditor() {
    await this.page
      .locator(
        '#jsoneditor > div > div.jsoneditor-menu > div.jsoneditor-modes > button'
      )
      .click()
    await this.page
      .locator(
        '#jsoneditor > div > div.jsoneditor-menu > div.jsoneditor-anchor > div > div > ul > li:nth-child(3) > button > div.jsoneditor-text'
      )
      .click()
  }

  async getEditorTextValue() {
    return this.page
      .locator('#jsoneditor-organisation-object')
      .getAttribute('value')
  }

  async updateOrgId(orgId) {
    const cell = this.page.locator(
      '#jsoneditor > div > div.jsoneditor-outer.has-main-menu-bar.has-nav-bar > div > div > table > tbody > tr:nth-child(6) > td:nth-child(3) > table > tbody > tr > td:nth-child(4) > div'
    )
    await cell.click()
    await cell.clear()
    await cell.fill(orgId)
    // Press Tab to blur the cell and trigger the jsoneditor onChange handler
    await this.page.keyboard.press('Tab')
  }

  async saveChanges() {
    await this.page.locator('#jsoneditor-save-button').click()
  }

  async saveButtonExists() {
    return (await this.page.locator('#jsoneditor-save-button').count()) > 0
  }
}

export { JsonEditor }
