import { Page } from 'page-objects/page'
import { expect } from '@playwright/test'
import { checkDoubleClickPrevented } from '../../support/double-click.js'
import { UploadSummaryLogPage } from '../upload.summary.log.page.js'
import { ReportsPage } from './reports.page.js'

class ReportDetailPage extends Page {
  open(orgId, regId, year, cadence, period, submissionNumber = 1) {
    return this.page.goto(
      `/organisations/${orgId}/registrations/${regId}/reports/${year}/${cadence}/${period}/submissions/${submissionNumber}`
    )
  }

  async useThisData() {
    await this.page.locator('button[type=submit]').click()
  }

  // The detail page renders each section total as a `govuk-caption-l` label
  // immediately followed by a `govuk-heading-l` value (e.g. "26.60"). There is
  // no test id, so we key off the caption text and take its sibling value.
  async #sectionTotalByCaption(caption) {
    return this.page
      .locator(
        `//p[contains(@class, "govuk-caption-l")][normalize-space()="${caption}"]/following-sibling::p[1]`
      )
      .innerText()
  }

  async totalTonnageExported() {
    return this.#sectionTotalByCaption('Total tonnage exported')
  }

  async useThisDataAndCheckDoubleClickPrevented() {
    await checkDoubleClickPrevented(this.page, 'button[type=submit]')
  }

  async uploadNewSummaryLog() {
    await this.page
      .locator('a.govuk-button--secondary', {
        hasText: 'Upload new summary log'
      })
      .click()
  }

  async cancelAndReturnToReports() {
    await this.page
      .locator('a', { hasText: /^Cancel and return to reports$/ })
      .click()
  }

  async verifyDetailPageButtons() {
    expect(await this.headingText()).toContain('Your summary log data')

    await this.uploadNewSummaryLog()
    const uploadSummaryLogPage = new UploadSummaryLogPage(this.page)
    expect(await uploadSummaryLogPage.headingText()).toContain(
      'Upload your summary log'
    )

    await this.page.goBack()
    await this.cancelAndReturnToReports()
    const reportsPage = new ReportsPage(this.page)
    expect(await reportsPage.headingText()).toContain('Reports')
  }
}

export { ReportDetailPage }
