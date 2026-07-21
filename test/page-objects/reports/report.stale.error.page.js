import { $ } from '@wdio/globals'
import { Page } from 'page-objects/page'

class ReportStaleErrorPage extends Page {
  async returnToReports() {
    await $('a*=Return to reports').click()
  }

  async deleteAndStartAgain() {
    await $('button[type=submit]').click()
  }
}

export default new ReportStaleErrorPage()
