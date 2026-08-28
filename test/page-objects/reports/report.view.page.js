import { Page } from 'page-objects/page'

class ReportViewPage extends Page {
  open(orgId, regId, year, cadence, period, submissionNumber = 1) {
    return this.page.goto(
      `/organisations/${orgId}/registrations/${regId}/reports/${year}/${cadence}/${period}/submissions/${submissionNumber}/view`
    )
  }

  makeChangesLink() {
    return this.page.getByRole('button', {
      name: 'Make changes to this report',
      exact: true
    })
  }

  async hasMakeChangesLink() {
    return (await this.makeChangesLink().count()) > 0
  }
}

export { ReportViewPage }
