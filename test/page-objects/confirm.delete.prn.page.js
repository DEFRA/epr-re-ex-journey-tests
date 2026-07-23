import { Page } from 'page-objects/page'

class ConfirmDeletePRNPage extends Page {
  async deletePrnAndCheckDoubleClickPrevented() {
    await this.submitAndCheckDoubleClickPrevented()
  }

  async deletePrn() {
    await this.submit()
  }
}

export { ConfirmDeletePRNPage }
