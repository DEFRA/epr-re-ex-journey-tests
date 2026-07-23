import { Page } from 'page-objects/page'

class ConfirmDiscardPRNPage extends Page {
  async discardAndCheckDoubleClickPrevented() {
    await this.submitAndCheckDoubleClickPrevented()
  }

  async discardAndStartAgain() {
    await this.submit()
  }
}

export { ConfirmDiscardPRNPage }
