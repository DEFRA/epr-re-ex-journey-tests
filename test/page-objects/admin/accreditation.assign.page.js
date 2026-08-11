import { AdminPage } from 'page-objects/admin/page'

// The "assign an unlinked accreditation to a registration" form (PAE-1816),
// reached from the Assign to registration action on an orphan row of the
// organisation overview. An orphan has no registration to hang off, so this is
// the one admin accreditation page not nested under one.
class AccreditationAssignPage extends AdminPage {
  get registrationSelect() {
    return this.page.locator('select[name="registrationId"]')
  }

  // The candidate registrations offered, in the order rendered. Any empty
  // placeholder option a mandatory select carries is not a candidate, so it is
  // dropped rather than asserted on.
  async getRegistrationOptions() {
    const options = await this.registrationSelect
      .locator('option')
      .allInnerTexts()
    return options.map((option) => option.trim()).filter(Boolean)
  }

  /**
   * @param {string} label - the candidate's visible text
   */
  async selectRegistration(label) {
    await this.registrationSelect.selectOption({ label })
  }

  async confirm() {
    await this.page.locator('button[type=submit]').click()
  }
}

export { AccreditationAssignPage }
