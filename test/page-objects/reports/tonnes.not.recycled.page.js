import { ReportDataBasePage } from './report-data.base.page.js'

class TonnesNotRecycledPage extends ReportDataBasePage {
  async enterTonnage(value) {
    await this.page.locator('#tonnageNotRecycled').fill(value)
  }
}

export { TonnesNotRecycledPage }
