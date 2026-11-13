import { Page } from 'page-objects/page'
import { checkBodyText } from '../support/checks.js'

const SUBMIT_SELECTOR = '#main-content button[type=submit]'

// The year a journey uploads under unless it chooses another.
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

  async checkUploaded(year = UPLOAD_YEAR) {
    await checkBodyText(this.page, `Summary log uploaded (${year})`, 30)
  }

  returnToHomePageLink() {
    return this.returnToHomeLink()
  }

  async confirmAndCheckDoubleClickPrevented() {
    await this.submitAndCheckDoubleClickPrevented(SUBMIT_SELECTOR, {
      waitForNavigation: false
    })
  }
}
