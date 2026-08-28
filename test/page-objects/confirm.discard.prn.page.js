import { Page } from 'page-objects/page'

class ConfirmDiscardPRNPage extends Page {
  async discardAndCheckDoubleClickPrevented() {
    await this.clickButtonCheckingDoubleClickPrevented(
      'Discard and start again'
    )
  }

  async discardAndStartAgain() {
    await this.clickButton('Discard and start again')
  }
}

export { ConfirmDiscardPRNPage }
