import { Page } from 'page-objects/page'

// The registration detail page (/organisations/{org}/registrations/{reg}),
// reached by clicking a material row on the operator dashboard.
class RegistrationPage extends Page {
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

export { RegistrationPage }
