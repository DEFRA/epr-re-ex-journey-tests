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
      .locator(
        '#main-content > div > div:nth-child(2) > div > dl > div:nth-child(10) > dd > a'
      )
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
}

export { RegistrationOverviewPage }
