import { $ } from '@wdio/globals'

class ConfirmationPage {
  async goToReports() {
    await $('a*=Go to reports').click()
  }

  async viewDraftReport() {
    await $('a*=View draft report').click()
  }
}

export default new ConfirmationPage()
