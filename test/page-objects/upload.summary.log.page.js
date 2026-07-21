import { browser, $, $$ } from '@wdio/globals'
import { checkBodyText } from '../support/checks.js'
import { SummaryLogUploadActions } from './summary-log-upload-actions.js'
import EnhancedCheckSummaryLogPage from './enhanced.check.summary.log.page.js'

class UploadSummaryLogPage extends SummaryLogUploadActions {
  async performUploadAndReturnToHomepage(filePath) {
    await this.uploadFile(filePath)
    await this.continue()

    await checkBodyText('Your summary log is being checked', 30)
    await checkBodyText('Upload your summary log', 60)

    await EnhancedCheckSummaryLogPage.upload()

    await checkBodyText('Your waste records are being updated', 30)
    await checkBodyText('Summary log uploaded', 60)
    await this.clickOnReturnToHomePage()
  }

  async getValidationErrors() {
    return await $$(
      '[data-testid="app-page-body"] table.govuk-table tbody tr'
    ).map(async (row) => {
      const values = await row.$$('td').map((cell) => cell.getText())

      // A record's first row carries the rowspanned Row ID + Section cells
      // (6 cells); its remaining cells render only the 4 per-cell columns.
      if (values.length === 6) {
        const [rowId, section, columnHeader, cell, dataEntered, errorMessage] =
          values
        return { rowId, section, columnHeader, cell, dataEntered, errorMessage }
      }

      const [columnHeader, cell, dataEntered, errorMessage] = values
      return {
        rowId: '',
        section: '',
        columnHeader,
        cell,
        dataEntered,
        errorMessage
      }
    })
  }

  async expandLoadsList() {
    // Excluded/non-balance-affecting loads render inside govuk-details
    // accordions, so their per-row reason text is only in innerText when open.
    // Force every accordion open (idempotent — avoids toggling closed any that
    // already default to open).
    await browser.execute(() => {
      document.querySelectorAll('details.govuk-details').forEach((details) => {
        details.setAttribute('open', '')
      })
    })
  }

  async returnToSubmissionPage() {
    await $('#main-content form > div.govuk-button-group > a').click()
  }

  // The "Go to reports" button in the success page's "Further action needed"
  // section. A PAE-1648 addition, shown only when the upload contains
  // closed-period adjustments (FEATURE_FLAG_CLOSED_PERIOD_ADJUSTMENTS).
  goToReportsButton() {
    return $('a.govuk-button*=Go to reports')
  }
}

export default new UploadSummaryLogPage()
