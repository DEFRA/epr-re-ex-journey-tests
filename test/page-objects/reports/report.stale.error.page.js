import { Page } from 'page-objects/page'

class ReportStaleErrorPage extends Page {
  returnToReports() {
    return this.page.getByRole('link', {
      name: 'Return to reports',
      exact: true
    })
  }

  async deleteAndStartAgain() {
    await this.clickButton('Delete and start again')
  }
}

export { ReportStaleErrorPage }
