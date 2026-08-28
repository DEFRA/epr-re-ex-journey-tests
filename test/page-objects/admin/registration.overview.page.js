import { AdminPage } from 'page-objects/admin/page'

class RegistrationOverviewPage extends AdminPage {
  async getReportsTableData() {
    // .count() below reads the DOM as-is with no auto-wait, so without this
    // the table can be read before it's rendered - seen as an intermittent
    // 0-row result in CI.
    await this.page
      .locator('#reports table')
      .waitFor({ state: 'visible', timeout: 10000 })

    const rows = this.page.locator('#reports table tbody tr')
    const count = await rows.count()
    const data = []

    for (let i = 0; i < count; i++) {
      const row = rows.nth(i)
      const linkLocators = row.locator('td:nth-child(5) a')
      const linkCount = await linkLocators.count()
      const links = []
      for (let j = 0; j < linkCount; j++) {
        const link = linkLocators.nth(j)
        links.push({
          text: await link.innerText(),
          href: await link.getAttribute('href')
        })
      }

      data.push({
        period: await row.locator('td:nth-child(1)').innerText(),
        submission: await row.locator('td:nth-child(2)').innerText(),
        due: await row.locator('td:nth-child(3)').innerText(),
        status: await row.locator('td:nth-child(4)').innerText(),
        actions: await row.locator('td:nth-child(5)').innerText(),
        links
      })
    }

    return data
  }

  async clickOnViewORSLink() {
    await this.page
      .locator('.govuk-summary-list__row', {
        has: this.page.locator('dt', { hasText: 'Overseas sites' })
      })
      .getByRole('link', { name: 'View', exact: true })
      .click()
  }

  // The actions cell renders <a>View</a><br><a>Unsubmit</a>, so the nth-child
  // indices below count the <br>: View is child 1 and Unsubmit is child 3.
  async clickOnViewReportLink(row) {
    await this.page
      .locator(
        `#reports > table > tbody > tr:nth-child(${row}) > td:nth-child(5) > a:nth-child(1)`
      )
      .click()
  }

  async clickOnUnsubmitReportLink(row) {
    await this.page
      .locator(
        `#reports > table > tbody > tr:nth-child(${row}) > td:nth-child(5) > a:nth-child(3)`
      )
      .click()
  }

  async unsubmitReportLinkExists(row) {
    return (
      (await this.page
        .locator(
          `#reports > table > tbody > tr:nth-child(${row}) > td:nth-child(5) > a:nth-child(3)`
        )
        .count()) > 0
    )
  }

  async getSummaryLogsContent() {
    return this.page.locator('#summary-logs').innerText()
  }

  // The summary-logs table Actions cell (3rd column) renders
  // <a>View data</a><br><a>Download</a>; return both links so a test can
  // assert on the entry points offered for a log.
  async getSummaryLogActionLinks(row) {
    const cell = this.page.locator(
      `#summary-logs table tbody tr:nth-child(${row}) td:nth-child(3)`
    )
    await cell.waitFor({ state: 'visible', timeout: 10000 })

    const links = cell.locator('a')
    const count = await links.count()
    const data = []
    for (let i = 0; i < count; i++) {
      const link = links.nth(i)
      data.push({
        text: await link.innerText(),
        href: await link.getAttribute('href')
      })
    }
    return data
  }

  async clickViewSummaryLogData(row) {
    await this.page
      .locator(`#summary-logs table tbody tr:nth-child(${row}) td:nth-child(3)`)
      .getByRole('link', { name: 'View data' })
      .click()
  }

  accreditationStatusRow() {
    return this.page.locator('.govuk-summary-list__row', {
      has: this.page.locator('dt', { hasText: 'Accreditation status' })
    })
  }

  async getAccreditationStatus() {
    const row = this.accreditationStatusRow()
    await row.waitFor({ state: 'visible', timeout: 10000 })
    return row.locator('.govuk-summary-list__value').innerText()
  }

  // Clicks a status-transition action (Approve, Suspend, Reapprove, Cancel,
  // Reinstate) on the Accreditation status row. Each action's accessible name
  // ends in the visually hidden word "accreditation".
  async clickAccreditationAction(actionText) {
    await this.accreditationStatusRow()
      .getByRole('link', {
        name: new RegExp(`^${actionText} accreditation$`, 'i')
      })
      .click()
  }

  // The registration's own status row is labelled just "Status" - anchored
  // regex so it doesn't also match the "Accreditation status" row below it.
  // Regex hasText matches the raw (untrimmed) text content, and the summary
  // list macro pads the dt with whitespace, so the anchors must allow it.
  registrationStatusRow() {
    return this.page.locator('.govuk-summary-list__row', {
      has: this.page.locator('dt', { hasText: /^\s*Status\s*$/ })
    })
  }

  async getRegistrationStatus() {
    const row = this.registrationStatusRow()
    await row.waitFor({ state: 'visible', timeout: 10000 })
    return row.locator('.govuk-summary-list__value').innerText()
  }

  // Clicks a status-transition action (Approve, Reject, Reopen, Cancel,
  // Reinstate) on the registration's Status row. Each action's accessible name ends in the
  // visually hidden word "registration".
  async clickRegistrationAction(actionText) {
    await this.registrationStatusRow()
      .getByRole('link', {
        name: new RegExp(`^${actionText} registration$`, 'i')
      })
      .click()
  }
}

export { RegistrationOverviewPage }
