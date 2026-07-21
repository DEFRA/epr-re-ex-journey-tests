import { browser, $ } from '@wdio/globals'
import { Page } from 'page-objects/page'

class WasteRecordsPage extends Page {
  open(orgId, regId) {
    return browser.url(`/organisations/${orgId}/registrations/${regId}`)
  }

  async submitSummaryLogLink() {
    await $('a*=Upload your summary log').click()
  }

  async createNewPRNLink() {
    await $('a*=Create new PRN').click()
  }

  async managePRNsLink() {
    await $('a*=Manage PRNs').click()
  }

  async managePERNsLink() {
    await $('a*=Manage PERNs').click()
  }

  async createNewPERNLink() {
    await $('a*=Create new PERN').click()
  }

  async manageReportsLink() {
    await $('a*=Manage reports').click()
  }
}

export default new WasteRecordsPage()
