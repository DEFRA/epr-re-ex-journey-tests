import { expect } from '@playwright/test'
import { ReportsPage } from 'page-objects/reports/reports.page.js'

const ACTION_REQUIRED_COLOUR = { Due: 'orange', Overdue: 'red' }

/**
 * Assert an active reports row shows an "action required" status for an
 * un-started period: Due (orange) or Overdue (red).
 *
 * A period flips from Due to Overdue at 00:00 on the 21st of the month following
 * the reporting period (once its due date has passed). The suite runs against a
 * remote environment whose clock we cannot control, so we accept either status
 * rather than asserting a time-dependent value.
 * @param {import('@playwright/test').Page} page
 * @param {number} rowIndex
 */
export const expectActionRequiredStatus = async (page, rowIndex) => {
  const reportsPage = new ReportsPage(page)
  const badge = await reportsPage.getActiveStatusBadge(rowIndex)
  const colour = await reportsPage.getActiveStatusColour(rowIndex)

  expect(Object.keys(ACTION_REQUIRED_COLOUR)).toContain(badge)
  expect(colour).toBe(ACTION_REQUIRED_COLOUR[badge])
}
