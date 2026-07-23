import { ReportDataBasePage } from './report-data.base.page.js'

class TonnesNotExportedPage extends ReportDataBasePage {
  async enterTonnage(value) {
    await this.page.locator('#tonnageNotExported').fill(value)
  }
}

export { TonnesNotExportedPage }
