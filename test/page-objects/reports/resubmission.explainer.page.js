import { $ } from '@wdio/globals'
import { Page } from 'page-objects/page'

class ResubmissionExplainerPage extends Page {
  // The Continue action is a govukButton rendered with an href, so it is an
  // anchor styled as a button (a GET link to the detail page), not a form
  // submit. It is the only govuk-button anchor on the explainer.
  async continue() {
    await $('a.govuk-button').click()
  }
}

export default new ResubmissionExplainerPage()
