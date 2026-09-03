import { Page } from 'page-objects/page'

class ResubmissionExplainerPage extends Page {
  // The Continue action is a govukButton rendered with an href, so it is an
  // anchor styled as a button (a GET link to the detail page), not a form
  // submit - but still role="button", and it's the only button the explainer
  // renders.
  async continue() {
    await this.page
      .getByRole('button', { name: 'Continue', exact: true })
      .click()
  }
}

export { ResubmissionExplainerPage }
