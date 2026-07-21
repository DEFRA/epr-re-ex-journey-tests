import { $ } from '@wdio/globals'
import { ReportDataBasePage } from './report-data.base.page.js'

class TonnesNotRecycledPage extends ReportDataBasePage {
  async enterTonnage(value) {
    await $('#tonnageNotRecycled').setValue(value)
  }
}

export default new TonnesNotRecycledPage()
