import { Page } from 'page-objects/page'

class ConfirmDeletePRNPage extends Page {
  async deletePrnAndCheckDoubleClickPrevented(noteType) {
    await this.clickButtonCheckingDoubleClickPrevented(`Delete ${noteType}`)
  }

  async deletePrn(noteType) {
    await this.clickButton(`Delete ${noteType}`)
  }
}

export { ConfirmDeletePRNPage }
