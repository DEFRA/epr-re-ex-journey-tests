import path from 'node:path'

import { expect } from '@playwright/test'
import { AdminPage } from 'page-objects/admin/page'
import { currentYear } from '~/test/support/date.js'

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
    const suffix = query ? `&${query}` : ''
    return super.open(`/overseas-sites?year=${currentYear()}${suffix}`)
  }

  open() {
    return super.open('/overseas-sites/imports')
  }

  async uploadWorkbook(localFilePath) {
    await this.page.locator('#ors-upload').setInputFiles(localFilePath)
  }

  async clickStartUpload() {
    await this.page.locator('button[type="submit"]').click()
  }

  async waitForStatusPage() {
    await expect(this.page.locator('main h1')).toHaveText(/^Import /, {
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

  /** @returns {import('@playwright/test').Locator} */
  downloadCsvButton() {
    return this.page.getByRole('button', { name: 'Download CSV', exact: true })
  }

  /** @returns {import('@playwright/test').Locator} */
  yearDropdown() {
    return this.page.getByLabel('Year', { exact: true })
  }

  /** @returns {Promise<string[]>} */
  async availableYears() {
    return this.yearDropdown().locator('option').allInnerTexts()
  }

  /** @param {string} year */
  async showYear(year) {
    await this.yearDropdown().selectOption(year)
    await this.page.locator('form.app-filters button[type="submit"]').click()
  }

  pageBodyText() {
    return this.page.locator('[data-testid="app-page-body"]').innerText()
  }

  async expectPaginationVisible() {
    await expect(this.paginationNav).toBeVisible()
  }

  paginationStatus() {
    return this.page.locator(
      '//p[contains(normalize-space(.), "Showing page")]'
    )
  }

  async getPaginationStatusText() {
    return this.paginationStatus().innerText()
  }

  nextPageLink() {
    return this.page.locator('nav.govuk-pagination .govuk-pagination__next a')
  }

  async filterByRegistrationNumber(registrationNumber) {
    await this.registrationNumberInput.fill(registrationNumber)
    await this.page.locator('form.app-filters button[type="submit"]').click()
  }

  // Hand-written markup rather than the govukButton macro, so it's a plain
  // link (no role="button") despite the button-styled classes.
  clearRegistrationNumberFilterLink() {
    return this.page.locator('form.app-filters a.govuk-button--inverse')
  }

  async getInsetText() {
    return this.page.locator('.govuk-inset-text').innerText()
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
