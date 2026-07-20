import { $ } from '@wdio/globals'
import { ReportDataBasePage } from './report-data.base.page.js'

class TonnesNotExportedPage extends ReportDataBasePage {
  async enterTonnage(value) {
    const el = await $('#tonnageNotExported')
    await el.waitForDisplayed({ timeout: 5000 })
    await el.setValue(value)
  }
}

export default new TonnesNotExportedPage()
