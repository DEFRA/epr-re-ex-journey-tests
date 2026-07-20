import { AdminPage } from 'page-objects/admin/page'
import { $ } from '@wdio/globals'

class ReportViewPage extends AdminPage {
  async getHeaderText() {
    const heading = $('#main-content h1.govuk-heading-xl')
    await heading.waitForExist()
    return heading.getText()
  }
}

export default new ReportViewPage()
