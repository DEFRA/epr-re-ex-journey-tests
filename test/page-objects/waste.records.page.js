import { Page } from 'page-objects/page'

class WasteRecordsPage extends Page {
  open(orgId, regId) {
    return this.page.goto(`/organisations/${orgId}/registrations/${regId}`)
  }

  async submitSummaryLogLink() {
    await this.page
      .getByRole('link', { name: 'Upload your summary log' })
      .click()
  }

  async createNewPRNLink() {
    await this.page.getByRole('link', { name: 'Create new PRN' }).click()
  }

  async managePRNsLink() {
    await this.page.getByRole('link', { name: 'Manage PRNs' }).click()
  }

  async managePERNsLink() {
    await this.page.getByRole('link', { name: 'Manage PERNs' }).click()
  }

  async createNewPERNLink() {
    await this.page.getByRole('link', { name: 'Create new PERN' }).click()
  }

  async manageReportsLink() {
    await this.page.getByRole('link', { name: 'Manage reports' }).click()
  }
}

export { WasteRecordsPage }
