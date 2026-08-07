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

  // The "Registration and accreditation" summary card. Scoping by its heading
  // keeps the link lookup robust against sibling cards on the same page.
  registrationAndAccreditationCard() {
    return this.page.locator('.govuk-summary-card', {
      has: this.page.getByRole('heading', {
        name: 'Registration and accreditation'
      })
    })
  }

  // The "apply for {year} accreditation" reapply link, present only when the
  // operator is eligible (PAE-1791).
  reapplyAccreditationLink() {
    return this.registrationAndAccreditationCard().getByRole('link', {
      name: /^apply for \d{4} accreditation$/
    })
  }
}

export { WasteRecordsPage }
