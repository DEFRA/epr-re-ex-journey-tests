import { browser, $ } from '@wdio/globals'
import { Page } from 'page-objects/page'
import { checkDoubleClickPrevented } from '../support/double-click.js'

// Flag-independent upload-page primitives for UploadSummaryLogPage: the upload
// page itself is unchanged by the flag (only the check page after it differs).
// A base class (not Object.assign) so the type-checker sees the inherited methods.
export class SummaryLogUploadActions extends Page {
  open(orgId, regId) {
    return browser.url(
      `/organisations/${orgId}/registrations/${regId}/summary-logs/upload`
    )
  }

  async uploadFile(filePath) {
    const remoteFilePath = await browser.uploadFile(filePath)
    await $('#summary-log-upload').setValue(remoteFilePath)
  }

  async continue() {
    await $('#main-content button[type=submit]').click()
  }

  async clickOnReturnToHomePage() {
    await $('a*=Return to home').click()
  }

  async confirmAndCheckDoubleClickPrevented() {
    await checkDoubleClickPrevented('#main-content button[type=submit]', {
      waitForNavigation: false
    })
  }
}
