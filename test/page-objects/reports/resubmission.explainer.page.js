import { $ } from '@wdio/globals'

class ResubmissionExplainerPage {
  async headingText() {
    const element = await $('h1.govuk-heading-xl')
    await element.waitForExist({ timeout: 5000 })
    return await element.getText()
  }

  // The Continue action is a govukButton rendered with an href, so it is an
  // anchor styled as a button (a GET link to the detail page), not a form
  // submit. It is the only govuk-button anchor on the explainer.
  async continue() {
    await $('a.govuk-button').click()
  }
}

export default new ResubmissionExplainerPage()
