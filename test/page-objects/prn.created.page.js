import { Page } from 'page-objects/page'

class PRNCreatedPage extends Page {
  async pernsPageLink() {
    await this.goToPernsPage()
  }

  async prnsPageLink() {
    await this.goToPrnsPage()
  }

  async returnToRegistrationPage() {
    await this.returnToHomePage()
  }
}

export { PRNCreatedPage }
