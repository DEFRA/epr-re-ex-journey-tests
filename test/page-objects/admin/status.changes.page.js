import { AdminPage } from 'page-objects/admin/page'

// The Registrations and Accreditations tables below the organisation's JSON
// editor. Columns: ID, number, linked number, status, actions.
const STATUS_COLUMN = 3

class StatusChangesPage extends AdminPage {
  /** @param {string} caption */
  table(caption) {
    return this.page.locator('#status-changes table', {
      has: this.page.locator('caption', { hasText: caption })
    })
  }

  /** @param {number} row - 1-based */
  registrationRow(row = 1) {
    return this.table('Registrations')
      .locator('tbody tr')
      .nth(row - 1)
  }

  /** @param {number} row - 1-based */
  accreditationRow(row = 1) {
    return this.table('Accreditations')
      .locator('tbody tr')
      .nth(row - 1)
  }

  /** @param {import('@playwright/test').Locator} row */
  async statusOf(row) {
    await row.waitFor({ state: 'visible', timeout: 10000 })
    return (await row.locator('td').nth(STATUS_COLUMN).innerText()).trim()
  }

  async getRegistrationStatus(row = 1) {
    return this.statusOf(this.registrationRow(row))
  }

  async getAccreditationStatus(row = 1) {
    return this.statusOf(this.accreditationRow(row))
  }

  // Each action's accessible name ends in the visually hidden record type,
  // e.g. "Reject registration".
  async clickRegistrationAction(actionText, row = 1) {
    await this.registrationRow(row)
      .getByRole('link', {
        name: new RegExp(`^${actionText} registration$`, 'i')
      })
      .click()
  }

  async clickAccreditationAction(actionText, row = 1) {
    await this.accreditationRow(row)
      .getByRole('link', {
        name: new RegExp(`^${actionText} accreditation$`, 'i')
      })
      .click()
  }
}

export { StatusChangesPage }
