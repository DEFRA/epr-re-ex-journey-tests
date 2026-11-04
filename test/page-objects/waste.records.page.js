import { Page } from 'page-objects/page'

class WasteRecordsPage extends Page {
  open(orgId, regId) {
    return this.page.goto(`/organisations/${orgId}/registrations/${regId}`)
  }

  submitSummaryLogLink() {
    return this.page.getByRole('link', {
      name: 'Upload your summary log',
      exact: true
    })
  }

  createNewPRNLink() {
    return this.page.getByRole('link', { name: 'Create new PRN', exact: true })
  }

  managePRNsLink() {
    return this.page.getByRole('link', { name: 'Manage PRNs', exact: true })
  }

  managePERNsLink() {
    return this.page.getByRole('link', { name: 'Manage PERNs', exact: true })
  }

  createNewPERNLink() {
    return this.page.getByRole('link', {
      name: 'Create new PERN',
      exact: true
    })
  }

  manageReportsLink() {
    return this.page.getByRole('link', { name: 'Manage reports', exact: true })
  }

  // The status tag beside a label such as "Registration" or "Accreditation".
  statusBeside(label) {
    return this.page
      .locator('p', { hasText: `${label}:` })
      .locator('.govuk-tag')
  }

  async expectYear(year) {
    await this.expectYearShown(
      this.heading(),
      `(${year})`,
      new RegExp(`/${year}$`)
    )
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
}

export { WasteRecordsPage }
