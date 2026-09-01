import { AdminPage } from 'page-objects/admin/page'

class PrnCancelConfirmationPage extends AdminPage {
  getDetailsText() {
    return this.page.locator('#main-content').innerText()
  }

  confirmCancelButton() {
    return this.page.getByRole('button', {
      name: 'Yes, cancel this PRN',
      exact: true
    })
  }

  getPanelTitle() {
    return this.page.locator('.govuk-panel__title').innerText()
  }
}

export { PrnCancelConfirmationPage }
