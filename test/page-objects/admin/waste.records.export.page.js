import { AdminPage } from 'page-objects/admin/page'

class WasteRecordsExportPage extends AdminPage {
  open() {
    return super.open('/waste-records-export')
  }

  async fetchCsv() {
    return super.fetchCsv('/waste-records-export')
  }
}

export { WasteRecordsExportPage }
