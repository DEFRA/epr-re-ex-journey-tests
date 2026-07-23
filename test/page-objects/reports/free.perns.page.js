import { ReportDataBasePage } from './report-data.base.page.js'

class FreePernPage extends ReportDataBasePage {
  async enterTonnage(value) {
    await this.page.locator('#freeTonnage').fill(value)
  }
}

export { FreePernPage }
