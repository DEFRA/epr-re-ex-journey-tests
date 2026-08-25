import { Page } from 'page-objects/page'

/**
 * One registration, as a regulator reads it. The operator opens the same
 * address and gets the dashboard they manage the registration from, so this
 * page object is the regulator's half of that one address.
 */

const PERIODS_TABLE = '#main-content table.govuk-table'

class RegistrationDetailsPage extends Page {
  /**
   * The caption above the heading. It names the organisation and the
   * registration number, so it is what says which registration is on screen.
   * @returns {Promise<string>}
   */
  async captionText() {
    return this.page.locator('h1 .govuk-caption-xl').innerText()
  }

  /**
   * What the registration covers, keyed by the label of each row.
   * @returns {Promise<Record<string, string>>}
   */
  async summary() {
    return this.toDataMap(
      this.page.locator('#main-content dl.govuk-summary-list > div')
    )
  }

  /**
   * Every accredited period the registration holds, each row keyed by its
   * column heading. The first cell is a row header rather than a cell, so it
   * is read alongside them.
   *
   * The wait settles on the first row, so a page that rendered none fails here
   * rather than answering with an empty list a caller could read as a pass.
   * @returns {Promise<Map<string, string>[]>}
   */
  async accreditedPeriods() {
    const rows = this.page.locator(`${PERIODS_TABLE} > tbody > tr`)
    await rows.first().waitFor({ state: 'visible' })

    const headings = await this.page
      .locator(`${PERIODS_TABLE} > thead > tr th`)
      .allInnerTexts()

    const count = await rows.count()
    const periods = []

    for (let index = 1; index <= count; index++) {
      const cells = await this.page
        .locator(
          `${PERIODS_TABLE} > tbody > tr:nth-child(${index}) th, ${PERIODS_TABLE} > tbody > tr:nth-child(${index}) td`
        )
        .allInnerTexts()

      periods.push(
        new Map(headings.map((heading, cell) => [heading, cells[cell]]))
      )
    }

    return periods
  }

  /**
   * The action an accredited period offers. Every one of them reads the same,
   * so the hidden half of its name is what tells a reader which accreditation
   * it opens.
   * @param {number} row
   * @returns {import('@playwright/test').Locator}
   */
  actionLink(row) {
    return this.page.locator(
      `${PERIODS_TABLE} > tbody > tr:nth-child(${row}) td:last-child a`
    )
  }

  /**
   * The accreditation number a row's action link carries for a screen reader.
   * The span is clipped to a pixel, and innerText answers with what is
   * rendered, so this reads the text content instead.
   * @param {number} row
   * @returns {Promise<string>}
   */
  async getActionHiddenText(row) {
    const text = await this.actionLink(row)
      .locator('.govuk-visually-hidden')
      .textContent()

    return (text ?? '').trim()
  }

  /**
   * The trail back up the hierarchy, in the order the page renders it. The
   * breadcrumb sits outside the main content, so it is read on its own.
   * @returns {Promise<string[]>}
   */
  async breadcrumbs() {
    const texts = await this.page
      .locator('.govuk-breadcrumbs__list-item')
      .allInnerTexts()

    return texts.map((text) => text.trim())
  }

  /**
   * Every route the page offers a reader, with record ids masked so the set
   * can be compared. Reading the whole set is what says the page offers these
   * and nothing else, so a control added later has to be justified rather than
   * arriving unnoticed.
   * @returns {Promise<string[]>}
   */
  async offeredRoutes() {
    await this.page.locator('h1').waitFor({ state: 'visible' })

    const hrefs = await this.page
      .locator('#main-content a[href]')
      .evaluateAll((links) =>
        links.map((link) => link.getAttribute('href') ?? '')
      )

    return hrefs.map((href) => href.replace(/[0-9a-f]{24}/g, '{id}')).sort()
  }

  /**
   * Every control that would change something. A regulator reads and records
   * nothing, so this is the set that has to stay empty.
   * @returns {Promise<number>}
   */
  async changeControlCount() {
    return this.page.locator('#main-content button, #main-content form').count()
  }
}

export { RegistrationDetailsPage }
