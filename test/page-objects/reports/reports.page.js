import { $, $$ } from '@wdio/globals'

const ACTIVE_HEADING = 'Action required'
const SUBMITTED_HEADING = 'Submitted'

// Scope to the table whose nearest preceding h3 is this heading. The extra
// predicate matters when a section is empty: the landing renders no table for
// it (just a message), so a plain following-sibling would otherwise resolve to
// the next section's table (e.g. an empty Action required picking up Submitted).
const tableAfterHeadingXPath = (heading) =>
  `//h3[normalize-space()='${heading}']/following-sibling::table[contains(@class,'govuk-table')][preceding-sibling::h3[1][normalize-space()='${heading}']][1]`

const rowXPath = (tableXPath, rowIndex) =>
  `${tableXPath}//tbody/tr[${rowIndex}]`

// The action-link helpers key off the first govuk-link in the row, which
// assumes each row exposes exactly one action anchor (the period cell is plain
// text). If a row ever gains a second link, target the action column explicitly
// instead.
const selectActionLink = async (rowIndex, tableXPath) => {
  const linkElement = await $(
    `${rowXPath(tableXPath, rowIndex)}//a[contains(@class,'govuk-link')]`
  )
  await linkElement.waitForClickable({ timeout: 5000 })
  await linkElement.click()
}

// The action anchor carries a govuk-visually-hidden period suffix for screen
// readers (e.g. "Review and create draft" + "Quarter 1, 2026"), so match on the
// visible label as a substring rather than an exact string.
const actionLinkByTextXPath = (rowIndex, tableXPath, label) =>
  `${rowXPath(tableXPath, rowIndex)}//a[contains(@class,'govuk-link')][contains(normalize-space(), '${label}')]`

const selectActionLinkByText = async (rowIndex, tableXPath, label) => {
  const linkElement = await $(
    actionLinkByTextXPath(rowIndex, tableXPath, label)
  )
  await linkElement.waitForClickable({ timeout: 5000 })
  await linkElement.click()
}

const expectActionLink = async (rowIndex, tableXPath, label) => {
  const linkElement = await $(
    actionLinkByTextXPath(rowIndex, tableXPath, label)
  )
  await linkElement.waitForExist({ timeout: 5000 })
}

// Returns the href of the row's action anchor, so callers can assert the CTA
// targets the expected submission (e.g. a resubmitted period's "View report"
// must point at submission 2, not the superseded submission 1).
const getActionLinkHref = async (rowIndex, tableXPath) => {
  const linkElement = await $(
    `${rowXPath(tableXPath, rowIndex)}//a[contains(@class,'govuk-link')]`
  )
  await linkElement.waitForExist({ timeout: 5000 })
  return await linkElement.getAttribute('href')
}

const getStatusBadgeElement = async (rowIndex, tableXPath) => {
  const element = await $(
    `${rowXPath(tableXPath, rowIndex)}//*[contains(@class,'govuk-tag')]`
  )
  await element.waitForExist({ timeout: 5000 })
  return element
}

const getStatusBadge = async (rowIndex, tableXPath) => {
  const element = await getStatusBadgeElement(rowIndex, tableXPath)
  return await element.getText()
}

const getStatusColour = async (rowIndex, tableXPath) => {
  const element = await getStatusBadgeElement(rowIndex, tableXPath)
  const classAttr = (await element.getAttribute('class')) ?? ''
  const match = classAttr.match(/govuk-tag--(\w+)/)
  return match ? match[1] : 'blue'
}

const activeTableXPath = tableAfterHeadingXPath(ACTIVE_HEADING)
const submittedTableXPath = tableAfterHeadingXPath(SUBMITTED_HEADING)

class ReportsPage {
  async headingText() {
    const element = await $('h1.govuk-heading-l')
    await element.waitForExist({ timeout: 5000 })
    return await element.getText()
  }

  async selectActiveActionLink(rowIndex) {
    await selectActionLink(rowIndex, activeTableXPath)
  }

  async selectActiveActionLinkByText(rowIndex, label) {
    await selectActionLinkByText(rowIndex, activeTableXPath, label)
  }

  async getActivePeriodLabel(rowIndex) {
    return await $(`${rowXPath(activeTableXPath, rowIndex)}//td[1]`).getText()
  }

  async expectActiveActionLink(rowIndex, label) {
    await expectActionLink(rowIndex, activeTableXPath, label)
  }

  async expectSubmittedActionLink(rowIndex, label) {
    await expectActionLink(rowIndex, submittedTableXPath, label)
  }

  async getSubmittedActionLinkHref(rowIndex) {
    return await getActionLinkHref(rowIndex, submittedTableXPath)
  }

  // The Action required section renders an empty message instead of a table
  // when no period needs action, so a missing table is the empty state.
  async activeTableText() {
    const table = await $(activeTableXPath)
    if (!(await table.isExisting())) {
      return ''
    }
    return await table.getText()
  }

  async getActiveStatusBadge(rowIndex) {
    return await getStatusBadge(rowIndex, activeTableXPath)
  }

  async getSubmittedStatusBadge(rowIndex) {
    return await getStatusBadge(rowIndex, submittedTableXPath)
  }

  async getActiveStatusColour(rowIndex) {
    return await getStatusColour(rowIndex, activeTableXPath)
  }

  async getSubmittedStatusColour(rowIndex) {
    return await getStatusColour(rowIndex, submittedTableXPath)
  }

  async getActiveNumberOfRows() {
    return (await $$(activeTableXPath + '//tbody/tr')).length
  }
}

export default new ReportsPage()
