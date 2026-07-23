import { Page } from 'page-objects/page'

class ConfirmCancelPRNPage extends Page {
  async confirmCancelAndCheckDoubleClickPrevented() {
    await this.submitAndCheckDoubleClickPrevented()
  }

  async confirmCancelPrn() {
    await this.submit()
  }
}

export { ConfirmCancelPRNPage }
