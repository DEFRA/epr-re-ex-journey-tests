import { AdminPage } from 'page-objects/admin/page'
import { $ } from '@wdio/globals'

class UnlinkOrganisationConfirmationPage extends AdminPage {
  async getBodyText() {
    return $('#main-content p.govuk-body').getText()
  }

  async getWarningText() {
    return $('#main-content .govuk-warning-text__text').getText()
  }

  async confirmUnlink() {
    await $('#main-content form button').click()
  }

  async cancel() {
    await $('a*=Cancel').click()
  }
}

export default new UnlinkOrganisationConfirmationPage()
