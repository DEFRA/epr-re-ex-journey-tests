import { $, browser, expect } from '@wdio/globals'
import { checkDoubleClickPrevented } from '../../support/double-click.js'
import UploadSummaryLogPage from '../upload.summary.log.page.js'
import ReportsPage from './reports.page.js'

class ReportDetailPage {
  open(orgId, regId, year, cadence, period, submissionNumber = 1) {
    return browser.url(
      `/organisations/${orgId}/registrations/${regId}/reports/${year}/${cadence}/${period}/submissions/${submissionNumber}`
    )
  }

  async headingText() {
    const element = await $('h1.govuk-heading-xl')
    await element.waitForExist({ timeout: 5000 })
    return await element.getText()
  }

  async useThisData() {
    await $('button[type=submit]').click()
  }

  // The detail page renders each section total as a `govuk-caption-l` label
  // immediately followed by a `govuk-heading-l` value (e.g. "26.60"). There is
  // no test id, so we key off the caption text and take its sibling value.
  async #sectionTotalByCaption(caption) {
    const element = await $(
      `//p[contains(@class, "govuk-caption-l")][normalize-space()="${caption}"]/following-sibling::p[1]`
    )
    await element.waitForExist({ timeout: 5000 })
    return await element.getText()
  }

  async totalTonnageExported() {
    return this.#sectionTotalByCaption('Total tonnage exported')
  }

  async useThisDataAndCheckDoubleClickPrevented() {
    await checkDoubleClickPrevented('button[type=submit]')
  }

  async uploadNewSummaryLog() {
    await $('a.govuk-button--secondary=Upload new summary log').click()
  }

  async cancelAndReturnToReports() {
    await $('a=Cancel and return to reports').click()
  }

  async verifyDetailPageButtons() {
    expect(await this.headingText()).toContain('Your summary log data')

    await this.uploadNewSummaryLog()
    expect(await UploadSummaryLogPage.headingText()).toContain(
      'Upload your summary log'
    )

    await browser.back()
    await this.cancelAndReturnToReports()
    expect(await ReportsPage.headingText()).toContain('Reports')
  }
}

export default new ReportDetailPage()
