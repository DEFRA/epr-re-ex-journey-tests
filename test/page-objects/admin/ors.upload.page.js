import path from 'node:path'

import { $, $$, browser, expect } from '@wdio/globals'
import { AdminPage } from 'page-objects/admin/page'

class OrsUploadPage extends AdminPage {
  get listTable() {
    return $('table.govuk-table')
  }

  get registrationNumberInput() {
    return $('#registrationNumber')
  }

  get paginationNav() {
    return $('nav.govuk-pagination')
  }

  get downloadCsvForm() {
    return $('form[method="POST"]')
  }

  openList(query = '') {
    const suffix = query ? `?${query}` : ''
    return super.open(`/overseas-sites${suffix}`)
  }

  open() {
    return super.open('/overseas-sites/imports')
  }

  async capturePageState() {
    const url = await browser.getUrl()
    const heading = await $('main h1')
      .getText()
      .catch(() => '(no h1 found)')
    const body = await $('[data-testid="app-page-body"]')
      .getText()
      .catch(() => '(no page body found)')

    return `URL: ${url}\nHeading: ${heading}\nBody: ${body}`
  }

  async uploadWorkbook(localFilePath) {
    const remotePath = await browser.uploadFile(localFilePath)
    const uploadInput = await $('#ors-upload')
    await uploadInput.waitForDisplayed({
      timeout: 5000,
      timeoutMsg: 'Upload file input not displayed'
    })
    await uploadInput.setValue(remotePath)
  }

  async clickStartUpload() {
    const startUploadButton = await $('button[type="submit"]')
    await startUploadButton.waitForClickable({
      timeout: 5000,
      timeoutMsg: 'Start upload button not clickable'
    })
    await startUploadButton.click()
  }

  async waitForStatusPage() {
    await browser.waitUntil(
      async () => {
        const url = await browser.getUrl()
        return /\/overseas-sites\/imports\/[^/]+$/u.test(url)
      },
      {
        timeout: 15000,
        interval: 500,
        timeoutMsg: `Not redirected to status page. ${await this.capturePageState()}`
      }
    )
  }

  async waitForCompletedOrFailedImport() {
    await browser.waitUntil(
      async () => {
        const heading = await $('main h1').getText()
        return heading === 'Import completed' || heading === 'Import failed'
      },
      {
        timeout: 30000,
        interval: 3000,
        timeoutMsg: `Import did not reach terminal state. ${await this.capturePageState()}`
      }
    )

    return $('main h1').getText()
  }

  async getStatusSummaryText() {
    return $('#main-content').getText()
  }

  async getUploadedFileResults() {
    const rows = await $$('table.govuk-table tbody tr')
    const results = []

    for (const row of rows) {
      const fileName = await row.$('td:nth-child(1)').getText()
      const result = await row.$('td:nth-child(2)').getText()
      const details = await row.$('td:nth-child(3)').getText()

      results.push({ fileName, result, details })
    }

    return results
  }

  async getListTableHeaders() {
    const listTable = await this.listTable
    await listTable.waitForDisplayed({
      timeout: 10000,
      timeoutMsg: 'ORS list table not displayed'
    })

    const headerCells = await $$('table.govuk-table thead th')
    const headers = []

    for (const headerCell of headerCells) {
      headers.push((await headerCell.getText()).trim())
    }

    return headers
  }

  async getListTableRows() {
    const listTable = await this.listTable
    await listTable.waitForDisplayed({
      timeout: 10000,
      timeoutMsg: 'ORS list table not displayed'
    })

    await browser.waitUntil(
      async () => {
        const rows = await $$('table.govuk-table tbody tr')
        return (await rows.length) > 0
      },
      {
        timeout: 10000,
        interval: 250,
        timeoutMsg: 'ORS list table rows not displayed'
      }
    )

    const rows = await $$('table.govuk-table tbody tr')
    const tableRows = []

    for (const row of rows) {
      const cells = await row.$$('td')
      const rowValues = []

      for (const cell of cells) {
        rowValues.push((await cell.getText()).trim())
      }

      tableRows.push(rowValues)
    }

    return tableRows
  }

  async expectDownloadCsvVisible() {
    const form = await this.downloadCsvForm
    const button = await form.$('button[type="submit"]')

    await expect(form).toBeDisplayed()
    await expect(button).toBeDisplayed()
    await expect(button).toHaveText('Download CSV')
  }

  /**
   * @returns {Promise<{status: number, contentDisposition: string|null, contentType: string|null, body: string}>}
   */
  async fetchListCsv() {
    return browser.execute(async () => {
      const form = document.querySelector('form[method="POST"]')

      if (!form) {
        throw new Error('ORS download form not found')
      }

      const formData = new URLSearchParams()

      for (const input of /** @type {NodeListOf<HTMLInputElement>} */ (
        form.querySelectorAll('input[name]')
      )) {
        formData.set(input.name, input.value)
      }

      const response = await fetch('/overseas-sites', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'content-type': 'application/x-www-form-urlencoded;charset=UTF-8'
        },
        body: formData.toString()
      })

      return {
        status: response.status,
        contentDisposition: response.headers.get('content-disposition'),
        contentType: response.headers.get('content-type'),
        body: await response.text()
      }
    })
  }

  async expectPaginationVisible() {
    const paginationNav = await this.paginationNav
    await expect(paginationNav).toBeDisplayed()
  }

  async getPaginationStatusText() {
    const summary = await $('//p[contains(normalize-space(.), "Showing page")]')
    await summary.waitForDisplayed({
      timeout: 10000,
      timeoutMsg: 'Pagination status summary not displayed'
    })

    return summary.getText()
  }

  async clickNextPage() {
    const nextLink = await $('nav.govuk-pagination .govuk-pagination__next a')
    await nextLink.waitForClickable({
      timeout: 10000,
      timeoutMsg: 'Next pagination link not clickable'
    })
    await nextLink.click()
  }

  async clickPageNumber(pageNumber) {
    const pageLink = await $(
      `nav.govuk-pagination a[href*="page=${pageNumber}&"]`
    )
    await pageLink.waitForClickable({
      timeout: 10000,
      timeoutMsg: `Pagination link for page ${pageNumber} not clickable`
    })
    await pageLink.click()
  }

  async filterByRegistrationNumber(registrationNumber) {
    const input = await this.registrationNumberInput
    await input.waitForDisplayed({
      timeout: 10000,
      timeoutMsg: 'Registration number filter input not displayed'
    })
    await input.setValue(registrationNumber)

    const button = await $('form.app-filters button[type="submit"]')
    await button.waitForClickable({
      timeout: 10000,
      timeoutMsg: 'Registration number search button not clickable'
    })
    await button.click()
  }

  async getRegistrationNumberFilterValue() {
    const input = await this.registrationNumberInput
    await input.waitForDisplayed({
      timeout: 10000,
      timeoutMsg: 'Registration number filter input not displayed'
    })

    return input.getValue()
  }

  async clearRegistrationNumberFilter() {
    const clearLink = await $('form.app-filters a.govuk-button--inverse')
    await clearLink.waitForClickable({
      timeout: 10000,
      timeoutMsg: 'Clear registration number filter link not clickable'
    })
    await clearLink.click()
  }

  async getInsetText() {
    const insetText = await $('.govuk-inset-text')
    await insetText.waitForDisplayed({
      timeout: 10000,
      timeoutMsg: 'Inset text not displayed'
    })

    return insetText.getText()
  }

  async permissionsErrorHeading() {
    return await $('#main-content > div > div > h1').getText()
  }

  async permissionsErrorText() {
    return await $('#main-content > div > div > p:nth-child(2)').getText()
  }

  async expectUploadFormVisible() {
    const uploadInput = await $('#ors-upload')
    const startButton = await $('button[type="submit"]')

    await expect(uploadInput).toBeDisplayed()
    await expect(startButton).toBeDisplayed()
  }

  workbookFileName(filePath) {
    return path.basename(filePath)
  }
}

export default new OrsUploadPage()
