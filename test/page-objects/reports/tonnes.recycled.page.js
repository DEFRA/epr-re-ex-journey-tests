import { ReportDataBasePage } from './report-data.base.page.js'

class TonnesRecycledPage extends ReportDataBasePage {
  async getValue() {
    return this.page.locator('#tonnageRecycled').inputValue()
  }

  async enterTonnage(value) {
    await this.page.locator('#tonnageRecycled').fill(value)
  }
}

export { TonnesRecycledPage }
