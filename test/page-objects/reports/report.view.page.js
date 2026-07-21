import { $, browser } from '@wdio/globals'
import { Page } from 'page-objects/page'

class ReportViewPage extends Page {
  open(orgId, regId, year, cadence, period, submissionNumber = 1) {
    return browser.url(
      `/organisations/${orgId}/registrations/${regId}/reports/${year}/${cadence}/${period}/submissions/${submissionNumber}/view`
    )
  }

  async makeChangesLink() {
    await $('a.govuk-button=Make changes to this report').click()
  }

  async hasMakeChangesLink() {
    return await $('a.govuk-button=Make changes to this report').isExisting()
  }
}

export default new ReportViewPage()
