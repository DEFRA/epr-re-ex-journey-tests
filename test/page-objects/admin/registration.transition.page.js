import { AdminPage } from 'page-objects/admin/page'

// The registration status-transition confirm page (currently only approve /
// grant). Shows a warning, a confirm button named per transition, and a
// Cancel link back to the overview.
class RegistrationTransitionPage extends AdminPage {
  async getHeading() {
    return this.page.locator('h1').innerText()
  }

  // The approve (grant) confirm page collects the registration number and
  // the date the registration is valid from (PAE-1814). Registrations don't
  // expire (PAE-1904), so there is no valid-to field.
  async fillGrantFields({ validFrom, registrationNumber }) {
    await this.page.locator('input[name="validFrom-day"]').fill(validFrom.day)
    await this.page
      .locator('input[name="validFrom-month"]')
      .fill(validFrom.month)
    await this.page.locator('input[name="validFrom-year"]').fill(validFrom.year)
    await this.page
      .locator('input[name="registrationNumber"]')
      .fill(registrationNumber)
  }

  async confirm(buttonText) {
    await this.page.getByRole('button', { name: buttonText }).click()
  }
}

export { RegistrationTransitionPage }
