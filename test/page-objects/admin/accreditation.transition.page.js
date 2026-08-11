import { AdminPage } from 'page-objects/admin/page'

// The accreditation status-transition confirm pages (approve / suspend /
// reapprove / cancel / reinstate). Each shows a warning, a confirm button
// named per transition, and a Cancel link back to the overview.
class AccreditationTransitionPage extends AdminPage {
  async getHeading() {
    return this.page.locator('h1').innerText()
  }

  // The approve (grant) confirm page collects the accreditation number and
  // the dates the accreditation is valid from and valid to (PAE-1814).
  async fillGrantFields({ validFrom, validTo, accreditationNumber }) {
    await this.page.locator('input[name="validFrom-day"]').fill(validFrom.day)
    await this.page
      .locator('input[name="validFrom-month"]')
      .fill(validFrom.month)
    await this.page.locator('input[name="validFrom-year"]').fill(validFrom.year)
    await this.page.locator('input[name="validTo-day"]').fill(validTo.day)
    await this.page.locator('input[name="validTo-month"]').fill(validTo.month)
    await this.page.locator('input[name="validTo-year"]').fill(validTo.year)
    await this.page
      .locator('input[name="accreditationNumber"]')
      .fill(accreditationNumber)
  }

  async confirm(buttonText) {
    await this.page.getByRole('button', { name: buttonText }).click()
  }
}

export { AccreditationTransitionPage }
