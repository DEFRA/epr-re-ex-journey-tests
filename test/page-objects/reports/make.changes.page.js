import { $ } from '@wdio/globals'
import { Page } from 'page-objects/page'
import { checkDoubleClickPrevented } from '../../support/double-click.js'

class MakeChangesPage extends Page {
  async useThisReportsSummaryLog() {
    await $("button=Use this report's summary log").click()
  }

  async useThisReportsSummaryLogAndCheckDoubleClickPrevented() {
    await checkDoubleClickPrevented("button=Use this report's summary log")
  }

  async uploadNewSummaryLog() {
    await $('a.govuk-button--secondary=Upload new summary log').click()
  }

  async cancel() {
    await $('a=Cancel').click()
  }
}

export default new MakeChangesPage()
