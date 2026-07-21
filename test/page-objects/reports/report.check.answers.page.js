import { $ } from '@wdio/globals'
import { Page } from 'page-objects/page'
import { checkDoubleClickPrevented } from '../../support/double-click.js'

class ReportCheckAnswersPage extends Page {
  async createReport() {
    await $('button[type=submit]').click()
  }

  async createReportAndCheckDoubleClickPrevented() {
    await checkDoubleClickPrevented('button[type=submit]')
  }

  async deleteAndStartAgainLink() {
    await $('a.govuk-button--warning=Delete and start again').click()
  }
}

export default new ReportCheckAnswersPage()
