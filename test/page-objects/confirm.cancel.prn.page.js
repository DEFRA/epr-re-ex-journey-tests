import { Page } from 'page-objects/page'

class ConfirmCancelPRNPage extends Page {
  async confirmCancelAndCheckDoubleClickPrevented() {
    await this.clickButtonCheckingDoubleClickPrevented('Confirm cancellation')
  }

  async confirmCancelPrn() {
    await this.clickButton('Confirm cancellation')
  }
}

export { ConfirmCancelPRNPage }
