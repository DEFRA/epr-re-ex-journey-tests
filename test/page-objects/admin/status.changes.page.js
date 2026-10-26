import { AdminPage } from 'page-objects/admin/page'

// The Registrations and Accreditations tables below the organisation's JSON
// editor. Columns: ID, number, linked number, status, actions.
const LINKED_NUMBER_COLUMN = 2
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

  async getRegistrationLinkedNumber(row = 1) {
    return (
      await this.registrationRow(row)
        .locator('td')
        .nth(LINKED_NUMBER_COLUMN)
        .innerText()
    ).trim()
  }

  async getAccreditationLinkedNumber(row = 1) {
    return (
      await this.accreditationRow(row)
        .locator('td')
        .nth(LINKED_NUMBER_COLUMN)
        .innerText()
    ).trim()
  }

  // Each action's accessible name continues with the visually hidden record
  // type and number, e.g. "Reject registration R25SR500030912PA".
  async clickRegistrationAction(actionText, row = 1) {
    await this.registrationRow(row)
      .getByRole('link', {
        name: new RegExp(`^${actionText} registration\\b`, 'i')
      })
      .click()
  }

  async clickAccreditationAction(actionText, row = 1) {
    await this.accreditationRow(row)
      .getByRole('link', {
        name: new RegExp(`^${actionText} accreditation\\b`, 'i')
      })
      .click()
  }
}

export { StatusChangesPage }
