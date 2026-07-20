import { $ } from '@wdio/globals'
import { ReportDataBasePage } from './report-data.base.page.js'

class FreePrnsPage extends ReportDataBasePage {
  async enterTonnage(value) {
    const el = await $('#freeTonnage')
    await el.waitForExist({ timeout: 5000 })
    await el.setValue(value)
  }
}

export default new FreePrnsPage()
