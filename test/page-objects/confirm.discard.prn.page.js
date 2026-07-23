import { Page } from 'page-objects/page'
import { checkDoubleClickPrevented } from '../support/double-click.js'

class ConfirmDiscardPRNPage extends Page {
  async headingText() {
    return this.page.locator('h1.govuk-heading-xl').innerText()
  }

  async discardAndCheckDoubleClickPrevented() {
    await checkDoubleClickPrevented(this.page, 'button[type=submit]')
  }

  async discardAndStartAgain() {
    await this.page.locator('button[type=submit]').click()
  }
}

export { ConfirmDiscardPRNPage }
