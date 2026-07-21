import { AdminPage } from 'page-objects/admin/page'

class ReportSubmissionsPage extends AdminPage {
  open() {
    return super.open('/report-submissions')
  }

  async fetchCsv() {
    return super.fetchCsv('/report-submissions')
  }
}

export default new ReportSubmissionsPage()
