import { Page } from 'page-objects/page'
import { checkDoubleClickPrevented } from '../support/double-click.js'

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
    await this.page.locator('#main-content button[type=submit]').click()
  }

  async clickOnReturnToHomePage() {
    await this.page.locator('a', { hasText: 'Return to home' }).click()
  }

  async confirmAndCheckDoubleClickPrevented() {
    await checkDoubleClickPrevented(
      this.page,
      '#main-content button[type=submit]',
      { waitForNavigation: false }
    )
  }
}
