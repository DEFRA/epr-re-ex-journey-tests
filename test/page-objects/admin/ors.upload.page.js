import path from 'node:path'

import { expect } from '@playwright/test'
import { AdminPage } from 'page-objects/admin/page'

class OrsUploadPage extends AdminPage {
  get listTable() {
    return this.page.locator('table.govuk-table')
  }

  get registrationNumberInput() {
    return this.page.locator('#registrationNumber')
  }

  get paginationNav() {
    return this.page.locator('nav.govuk-pagination')
  }

  get downloadCsvForm() {
    return this.page.locator('form[method="POST"]')
  }

  openList(query = '') {
    const suffix = query ? `?${query}` : ''
    return super.open(`/overseas-sites${suffix}`)
  }

  open() {
    return super.open('/overseas-sites/imports')
  }

  async capturePageState() {
    const url = this.page.url()
    const heading = await this.page
      .locator('main h1')
      .innerText()
      .catch(() => '(no h1 found)')
    const body = await this.page
      .locator('[data-testid="app-page-body"]')
      .innerText()
      .catch(() => '(no page body found)')

    return `URL: ${url}\nHeading: ${heading}\nBody: ${body}`
  }

  async uploadWorkbook(localFilePath) {
    await this.page.locator('#ors-upload').setInputFiles(localFilePath)
  }

  async clickStartUpload() {
    await this.page.locator('button[type="submit"]').click()
  }

  async waitForStatusPage() {
    await this.page.waitForURL(/\/overseas-sites\/imports\/[^/]+$/, {
      timeout: 15000
    })
  }

  async waitForCompletedOrFailedImport() {
    await expect
      .poll(() => this.page.locator('main h1').innerText(), {
        timeout: 30000,
        intervals: [3000]
      })
      .toMatch(/Import completed|Import failed/)

    return this.page.locator('main h1').innerText()
  }

  async getStatusSummaryText() {
    return this.page.locator('#main-content').innerText()
  }

  async getUploadedFileResults() {
    const rows = this.page.locator('table.govuk-table tbody tr')
    const count = await rows.count()
    const results = []

    for (let i = 0; i < count; i++) {
      const row = rows.nth(i)
      results.push({
        fileName: await row.locator('td:nth-child(1)').innerText(),
        result: await row.locator('td:nth-child(2)').innerText(),
        details: await row.locator('td:nth-child(3)').innerText()
      })
    }

    return results
  }

  async getListTableHeaders() {
    await this.listTable.waitFor({ state: 'visible', timeout: 10000 })

    const headerCells = this.page.locator('table.govuk-table thead th')
    const count = await headerCells.count()
    const headers = []

    for (let i = 0; i < count; i++) {
      headers.push((await headerCells.nth(i).innerText()).trim())
    }

    return headers
  }

  async getListTableRows() {
    await this.listTable.waitFor({ state: 'visible', timeout: 10000 })

    const rows = this.page.locator('table.govuk-table tbody tr')
    await rows.first().waitFor({ state: 'visible', timeout: 10000 })

    const count = await rows.count()
    const tableRows = []

    for (let i = 0; i < count; i++) {
      const cells = rows.nth(i).locator('td')
      const cellCount = await cells.count()
      const rowValues = []

      for (let j = 0; j < cellCount; j++) {
        rowValues.push((await cells.nth(j).innerText()).trim())
      }

      tableRows.push(rowValues)
    }

    return tableRows
  }

  async expectDownloadCsvVisible() {
    const form = this.downloadCsvForm
    const button = form.locator('button[type="submit"]')

    await expect(form).toBeVisible()
    await expect(button).toBeVisible()
    await expect(button).toHaveText('Download CSV')
  }

  /**
   * @returns {Promise<{status: number, contentDisposition: string|null, contentType: string|null, body: string}>}
   */
  async fetchListCsv() {
    return this.page.evaluate(async () => {
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
    await expect(this.paginationNav).toBeVisible()
  }

  async getPaginationStatusText() {
    return this.page
      .locator('//p[contains(normalize-space(.), "Showing page")]')
      .innerText()
  }

  async clickNextPage() {
    await this.page
      .locator('nav.govuk-pagination .govuk-pagination__next a')
      .click()
  }

  async clickPageNumber(pageNumber) {
    await this.page
      .locator(`nav.govuk-pagination a[href*="page=${pageNumber}&"]`)
      .click()
  }

  async filterByRegistrationNumber(registrationNumber) {
    await this.registrationNumberInput.fill(registrationNumber)
    await this.page.locator('form.app-filters button[type="submit"]').click()
  }

  async getRegistrationNumberFilterValue() {
    return this.registrationNumberInput.inputValue()
  }

  async clearRegistrationNumberFilter() {
    await this.page.locator('form.app-filters a.govuk-button--inverse').click()
  }

  async getInsetText() {
    return this.page.locator('.govuk-inset-text').innerText()
  }

  async permissionsErrorHeading() {
    return this.page.locator('#main-content > div > div > h1').innerText()
  }

  async permissionsErrorText() {
    return this.page
      .locator('#main-content > div > div > p:nth-child(2)')
      .innerText()
  }

  async expectUploadFormVisible() {
    await expect(this.page.locator('#ors-upload')).toBeVisible()
    await expect(this.page.locator('button[type="submit"]')).toBeVisible()
  }

  workbookFileName(filePath) {
    return path.basename(filePath)
  }
}

export { OrsUploadPage }
