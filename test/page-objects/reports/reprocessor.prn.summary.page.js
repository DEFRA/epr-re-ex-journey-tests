import { $ } from '@wdio/globals'
import { ReportDataBasePage } from './report-data.base.page.js'

class ReprocessorPrnSummaryPage extends ReportDataBasePage {
  async enterRevenue(value) {
    await $('#prnRevenue').setValue(value)
  }
}

export default new ReprocessorPrnSummaryPage()
