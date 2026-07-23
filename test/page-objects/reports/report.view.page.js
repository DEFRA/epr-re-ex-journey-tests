import { Page } from 'page-objects/page'

class ReportViewPage extends Page {
  open(orgId, regId, year, cadence, period, submissionNumber = 1) {
    return this.page.goto(
      `/organisations/${orgId}/registrations/${regId}/reports/${year}/${cadence}/${period}/submissions/${submissionNumber}/view`
    )
  }

  #makeChangesLinkLocator() {
    return this.page.locator('a.govuk-button', {
      hasText: 'Make changes to this report'
    })
  }

  async makeChangesLink() {
    await this.#makeChangesLinkLocator().click()
  }

  async hasMakeChangesLink() {
    return (await this.#makeChangesLinkLocator().count()) > 0
  }
}

export { ReportViewPage }
