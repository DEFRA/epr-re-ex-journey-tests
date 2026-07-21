import { $, browser } from '@wdio/globals'

class JsonEditor {
  async switchToTextEditor() {
    await $(
      '#jsoneditor > div > div.jsoneditor-menu > div.jsoneditor-modes > button'
    ).click()
    await $(
      '#jsoneditor > div > div.jsoneditor-menu > div.jsoneditor-anchor > div > div > ul > li:nth-child(2) > button > div.jsoneditor-text'
    ).click()
  }

  async switchToTreeEditor() {
    await $(
      '#jsoneditor > div > div.jsoneditor-menu > div.jsoneditor-modes > button'
    ).click()
    await $(
      '#jsoneditor > div > div.jsoneditor-menu > div.jsoneditor-anchor > div > div > ul > li:nth-child(3) > button > div.jsoneditor-text'
    ).click()
  }

  async getEditorTextValue() {
    return $('#jsoneditor-organisation-object').getAttribute('value')
  }

  async updateOrgId(orgId) {
    const cell = await $(
      '#jsoneditor > div > div.jsoneditor-outer.has-main-menu-bar.has-nav-bar > div > div > table > tbody > tr:nth-child(6) > td:nth-child(3) > table > tbody > tr > td:nth-child(4) > div'
    )
    await cell.click()
    await cell.clearValue()
    await cell.setValue(orgId)
    // Press Tab to blur the cell and trigger the jsoneditor onChange handler
    await browser.keys('Tab')
  }

  async saveChanges() {
    const saveButton = await $('#jsoneditor-save-button')
    await saveButton.waitForClickable()
    await saveButton.click()
  }

  async saveButtonExists() {
    const saveButton = $('#jsoneditor-save-button')
    return await saveButton.isExisting()
  }
}

export default new JsonEditor()
