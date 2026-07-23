import { ReportDataBasePage } from './report-data.base.page.js'

class FreePrnsPage extends ReportDataBasePage {
  async enterTonnage(value) {
    await this.page.locator('#freeTonnage').fill(value)
  }
}

export { FreePrnsPage }
