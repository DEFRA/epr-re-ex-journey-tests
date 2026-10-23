import { expect } from '@playwright/test'
import { Page } from 'page-objects/page'
import { checkBodyText } from '../support/checks.js'

const SUBMIT_SELECTOR = '#main-content button[type=submit]'

// Mirrors the frontend, which uploads every summary log for this year until
// the upload year becomes selectable.
export const UPLOAD_YEAR = 2026

// Flag-independent upload-page primitives for UploadSummaryLogPage: the upload
// page itself is unchanged by the flag (only the check page after it differs).
// A base class (not Object.assign) so the type-checker sees the inherited methods.
export class SummaryLogUploadActions extends Page {
  open(orgId, regId) {
    return this.page.goto(
      `/organisations/${orgId}/registrations/${regId}/summary-logs/upload`
    )
  }

  async uploadFile(filePath) {
    await this.page.locator('#summary-log-upload').setInputFiles(filePath)
  }

  async continue() {
    await this.submit(SUBMIT_SELECTOR)
  }

  async checkUploaded() {
    await checkBodyText(this.page, `Summary log uploaded (${UPLOAD_YEAR})`, 30)
  }

  async returnToHome() {
    await this.returnToHomeLink().click()
    await expect(this.page).toHaveURL(
      new RegExp(`/organisations/\\d+/${UPLOAD_YEAR}$`)
    )
  }

  async confirmAndCheckDoubleClickPrevented() {
    await this.submitAndCheckDoubleClickPrevented(SUBMIT_SELECTOR, {
      waitForNavigation: false
    })
  }
}
