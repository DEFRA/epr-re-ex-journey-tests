import { $ } from '@wdio/globals'
import { ReportDataBasePage } from './report-data.base.page.js'

class TonnesRecycledPage extends ReportDataBasePage {
  async getValue() {
    return await $('#tonnageRecycled').getValue()
  }

  async enterTonnage(value) {
    await $('#tonnageRecycled').setValue(value)
  }
}

export default new TonnesRecycledPage()
