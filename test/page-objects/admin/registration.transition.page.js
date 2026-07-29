import { AdminPage } from 'page-objects/admin/page'

// The registration status-transition confirm page (currently only approve /
// grant). Shows a warning, a confirm button named per transition, and a
// Cancel link back to the overview.
class RegistrationTransitionPage extends AdminPage {
  async getHeading() {
    return this.page.locator('h1').innerText()
  }

  // The approve (grant) confirm page collects the registration number and
  // the date the approval applies from.
  async fillGrantFields({ day, month, year, registrationNumber }) {
    await this.page.locator('input[name="appliesFrom-day"]').fill(day)
    await this.page.locator('input[name="appliesFrom-month"]').fill(month)
    await this.page.locator('input[name="appliesFrom-year"]').fill(year)
    await this.page
      .locator('input[name="registrationNumber"]')
      .fill(registrationNumber)
  }

  async confirm(buttonText) {
    await this.page.getByRole('button', { name: buttonText }).click()
  }
}

export { RegistrationTransitionPage }
