import { Page } from 'page-objects/page'

const SUBMIT_SELECTOR = '#main-content button[type=submit]'

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

  async clickOnReturnToHomePage() {
    await this.returnToHomePage()
  }

  async confirmAndCheckDoubleClickPrevented() {
    await this.submitAndCheckDoubleClickPrevented(SUBMIT_SELECTOR, {
      waitForNavigation: false
    })
  }
}
