import { AdminPage } from 'page-objects/admin/page'

// The registration status-transition confirm page (currently only approve /
// grant). Shows a warning, a confirm button named per transition, and a
// Cancel link back to the overview.
class RegistrationTransitionPage extends AdminPage {
  async getHeading() {
    return this.page.locator('h1').innerText()
  }

  // The reprocessing-type radios, offered only where a reprocessing type
  // applies - never to an exporter (PAE-1818).
  reprocessingTypeRadios() {
    return this.page.locator('input[name="reprocessingType"]')
  }

  /**
   * GOV.UK radios hide the native input under a styled circle, so clicking the
   * input directly fails Playwright's actionability check - click the label it
   * is bound to instead.
   *
   * @param {string} reprocessingType
   */
  async selectReprocessingType(reprocessingType) {
    const radioId = await this.page
      .locator(`input[name="reprocessingType"][value="${reprocessingType}"]`)
      .getAttribute('id')
    await this.page.locator(`label[for="${radioId}"]`).click()
  }

  /**
   * The approve (grant) confirm page collects the registration number and the
   * dates the registration is valid from and valid to (PAE-1814), plus a
   * reprocessing type where one applies (PAE-1818).
   *
   * @param {{
   *   validFrom: { day: string, month: string, year: string },
   *   validTo: { day: string, month: string, year: string },
   *   registrationNumber: string,
   *   reprocessingType?: string
   * }} grantFields
   */
  async fillGrantFields({
    validFrom,
    validTo,
    registrationNumber,
    reprocessingType
  }) {
    await this.page.locator('input[name="validFrom-day"]').fill(validFrom.day)
    await this.page
      .locator('input[name="validFrom-month"]')
      .fill(validFrom.month)
    await this.page.locator('input[name="validFrom-year"]').fill(validFrom.year)
    await this.page.locator('input[name="validTo-day"]').fill(validTo.day)
    await this.page.locator('input[name="validTo-month"]').fill(validTo.month)
    await this.page.locator('input[name="validTo-year"]').fill(validTo.year)
    await this.page
      .locator('input[name="registrationNumber"]')
      .fill(registrationNumber)

    if (reprocessingType) {
      await this.selectReprocessingType(reprocessingType)
    }
  }

  async confirm(buttonText) {
    await this.page.getByRole('button', { name: buttonText }).click()
  }
}

export { RegistrationTransitionPage }
