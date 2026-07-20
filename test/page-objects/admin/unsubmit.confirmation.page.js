import { AdminPage } from 'page-objects/admin/page'
import { $ } from '@wdio/globals'

class UnsubmitConfirmationPage extends AdminPage {
  async getWarningText() {
    return await $('.govuk-warning-text__text').getText()
  }

  async confirmUnsubmit() {
    await $('button=Yes, unsubmit this report').click()
  }

  async getSuccessMessage() {
    return await $('.govuk-panel__title').getText()
  }

  async returnToRegistrationOverview() {
    await $('a=Back to registration overview').click()
  }
}

export default new UnsubmitConfirmationPage()
