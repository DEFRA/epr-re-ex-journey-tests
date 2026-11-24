import { Page } from 'page-objects/page'

class PRNViewPage extends Page {
  open(orgId, registrationNumber, year, prnId) {
    return this.page.goto(
      `/organisations/${orgId}/registrations/${registrationNumber}/accreditations/${year}/packaging-recycling-notes/${prnId}/view`
    )
  }

  returnToPRNList() {
    return this.page.getByRole('link', {
      name: 'Return to PRN list',
      exact: true
    })
  }

  returnToPERNList() {
    return this.page.getByRole('link', {
      name: 'Return to PERN list',
      exact: true
    })
  }

  /**
   * The view page shows the number in the inset under the heading; the action
   * page still lists it as a details row. Null until the note is issued.
   *
   * @param {'PRN' | 'PERN'} noteType
   * @returns {Promise<string | null>}
   */
  async prnNumber(noteType) {
    const label = `${noteType} number: `
    const line = this.page.locator('.govuk-inset-text').getByText(label)

    if ((await line.count()) > 0) {
      return (await line.innerText()).replace(label, '')
    }

    const details = await this.prnDetails()
    return details[`${noteType} number`] || null
  }

  cancelPRNButton() {
    return this.page.getByRole('button', { name: /^Cancel (PRN|PERN)$/ })
  }

  deletePRNButton() {
    return this.page.locator('.govuk-button-group a.govuk-button')
  }

  // Name-matched rather than selected by class: the cookie-consent banner's
  // Accept/Reject buttons also render as a .govuk-button-group of plain
  // govuk-buttons, so a class-only locator is ambiguous once that banner is
  // showing.
  issuePRNButton() {
    return this.page.getByRole('button', { name: /^Issue (PRN|PERN)$/ })
  }

  async issueAndCheckDoubleClickPrevented() {
    await this.submitAndCheckDoubleClickPrevented(this.issuePRNButton())
  }

  /**
   * The issue button posts back to this page, so its form is what says it is
   * there.
   *
   * @returns {Promise<number>}
   */
  async formCount() {
    return this.page.locator('#main-content form').count()
  }
}

export { PRNViewPage }
