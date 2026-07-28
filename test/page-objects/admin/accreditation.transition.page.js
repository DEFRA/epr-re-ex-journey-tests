import { AdminPage } from 'page-objects/admin/page'

// The accreditation status-transition confirm pages (approve / suspend /
// reapprove / cancel / reinstate). Each shows a warning, a confirm button
// named per transition, and a Cancel link back to the overview.
class AccreditationTransitionPage extends AdminPage {
  async getHeading() {
    return this.page.locator('h1').innerText()
  }

  // The approve (grant) confirm page collects the accreditation number and
  // the date the approval applies from.
  async fillGrantFields({ day, month, year, accreditationNumber }) {
    await this.page.locator('input[name="appliesFrom-day"]').fill(day)
    await this.page.locator('input[name="appliesFrom-month"]').fill(month)
    await this.page.locator('input[name="appliesFrom-year"]').fill(year)
    await this.page
      .locator('input[name="accreditationNumber"]')
      .fill(accreditationNumber)
  }

  async confirm(buttonText) {
    await this.page.getByRole('button', { name: buttonText }).click()
  }
}

export { AccreditationTransitionPage }
