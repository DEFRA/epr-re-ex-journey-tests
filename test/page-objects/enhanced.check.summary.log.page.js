import { $, $$ } from '@wdio/globals'

class EnhancedCheckSummaryLogPage {
  async allSectionHeadings() {
    return $$('h2.govuk-heading-l').map((el) => el.getText())
  }

  async allSubStateHeadings() {
    return $$('h3.govuk-heading-m').map((el) => el.getText())
  }

  async expandAllLoadDetails() {
    const summaries = await $$('details.govuk-details summary')
    for (const summary of summaries) {
      await summary.click()
    }
  }

  async loadRowItems() {
    return $$('.epr-load-sections__rows li').map((el) => el.getText())
  }

  async loadDetailsText() {
    return (await $$('.govuk-details__text').map((el) => el.getText())).join(
      ' | '
    )
  }

  async upload() {
    await $('#main-content button[type=submit]').click()
  }

  // The PAE-1648 "Important" notification banner shown when the upload contains
  // closed-period adjustments. Guarded behind FEATURE_FLAG_CLOSED_PERIOD_ADJUSTMENTS.
  importantBanner() {
    return $('.govuk-notification-banner')
  }
}

export default new EnhancedCheckSummaryLogPage()
