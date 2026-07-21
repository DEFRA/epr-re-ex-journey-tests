import { $ } from '@wdio/globals'
import { Page } from 'page-objects/page'

export class ReportDataBasePage extends Page {
  async continue() {
    await $('button[value="continue"]').click()
  }

  async saveAndComeBackLater() {
    await $('button[value="save"]').click()
  }

  async deleteReportLink() {
    await $('a*=Delete report').click()
  }

  async enterRevenue(value) {
    await $('#prnRevenue').setValue(value)
  }
}
