import { Page } from 'page-objects/page'

class PRNCreatedPage extends Page {
  async pernsPageLink() {
    await this.page.locator('a', { hasText: 'PERNs page' }).click()
  }

  async prnsPageLink() {
    await this.page.locator('a', { hasText: 'PRNs page' }).click()
  }

  async returnToRegistrationPage() {
    await this.page.locator('a', { hasText: 'Return to home' }).click()
  }
}

export { PRNCreatedPage }
