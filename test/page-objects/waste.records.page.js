import { Page } from 'page-objects/page'

class WasteRecordsPage extends Page {
  open(orgId, regId) {
    return this.page.goto(`/organisations/${orgId}/registrations/${regId}`)
  }

  async submitSummaryLogLink() {
    await this.page.locator('a', { hasText: 'Upload your summary log' }).click()
  }

  async createNewPRNLink() {
    await this.page.locator('a', { hasText: 'Create new PRN' }).click()
  }

  async managePRNsLink() {
    await this.page.locator('a', { hasText: 'Manage PRNs' }).click()
  }

  async managePERNsLink() {
    await this.page.locator('a', { hasText: 'Manage PERNs' }).click()
  }

  async createNewPERNLink() {
    await this.page.locator('a', { hasText: 'Create new PERN' }).click()
  }

  async manageReportsLink() {
    await this.page.locator('a', { hasText: 'Manage reports' }).click()
  }
}

export { WasteRecordsPage }
