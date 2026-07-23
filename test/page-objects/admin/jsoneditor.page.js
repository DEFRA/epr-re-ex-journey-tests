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
    // Was a hardcoded tr:nth-child(6) row-position selector, but the tree's
    // row order shifts depending on the org's JSON shape (e.g. whether
    // statusHistory or other optional fields are present) - orgId doesn't
    // reliably land on row 6 for every org. Find the row by field name
    // instead, which is stable regardless of shape.
    const row = this.page.locator('tr', {
      has: this.page.locator('.jsoneditor-field', { hasText: /^orgId$/ })
    })
    const cell = row.locator('.jsoneditor-value').first()
    await cell.click()
    await cell.clear()
    await cell.fill(String(orgId))
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
