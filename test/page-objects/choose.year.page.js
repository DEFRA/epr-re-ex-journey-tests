import { Page } from 'page-objects/page'

class ChooseYearPage extends Page {
  yearOption(year) {
    return this.page.getByRole('radio', { name: String(year), exact: true })
  }

  continueButton() {
    return this.page.getByRole('button', { name: 'Continue', exact: true })
  }
}

export { ChooseYearPage }
