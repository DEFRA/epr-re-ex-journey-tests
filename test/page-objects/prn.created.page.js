import { Page } from 'page-objects/page'

class PRNCreatedPage extends Page {
  async pernsPageLink() {
    await this.page.getByRole('link', { name: 'PERNs page' }).click()
  }

  async prnsPageLink() {
    await this.page.getByRole('link', { name: 'PRNs page' }).click()
  }

  async returnToRegistrationPage() {
    await this.page.getByRole('link', { name: 'Return to home' }).click()
  }
}

export { PRNCreatedPage }
