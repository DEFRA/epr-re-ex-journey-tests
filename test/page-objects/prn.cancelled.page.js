import { Page } from 'page-objects/page'

class PRNCancelledPage extends Page {
  async statusText() {
    return this.page
      .locator('#main-content > div > div > div > div > strong')
      .innerText()
  }

  async returnToHomePage() {
    await this.page.locator('a', { hasText: 'Return to home' }).click()
  }

  async pernsPage() {
    await this.page.locator('a', { hasText: 'PERNs page' }).click()
  }

  async prnsPage() {
    await this.page.locator('a', { hasText: 'PRNs page' }).click()
  }
}

export { PRNCancelledPage }
