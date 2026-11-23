import { test, expect } from '@playwright/test'

import { AdminLoginPage } from 'page-objects/admin/login.page'
import { Navigation } from 'page-objects/admin/navigation.page'
import { SummaryLogUploadsPage } from 'page-objects/admin/summary.log.uploads.page'
import { seedAdminActivityData } from '../../support/seeding/admin-activity.js'
import { currentYear } from '../../support/date.js'
import { availableWasteRecordYears } from '../../support/waste-record-years.js'

test.describe('Summary log uploads report page', () => {
  let seeded

  test.beforeAll(async () => {
    seeded = await seedAdminActivityData()
  })

  test('Should list summary log upload activity for a chosen year and allow a CSV download @summaryLogsUploadsReport', async ({
    page
  }) => {
    const loginPage = new AdminLoginPage(page)
    const navigation = new Navigation(page)
    const summaryLogUploadsPage = new SummaryLogUploadsPage(page)
    const seededYear = String(seeded.accreditationYear)

    await loginPage.open()
    await expect(page).toHaveTitle(/Login/)
    await loginPage.enterCredentials('ea@test.gov.uk', 'pass')
    await loginPage.submitCredentials()

    await navigation.clickOnLink('Summary log uploads')

    const years = await availableWasteRecordYears()
    await expect(page).toHaveURL(
      new RegExp(`/summary-log\\?year=${currentYear()}$`)
    )
    expect(await summaryLogUploadsPage.availableYears()).toEqual(years)
    await expect(summaryLogUploadsPage.yearDropdown()).toHaveValue(
      String(currentYear())
    )

    const heading = await summaryLogUploadsPage.getHeaderText()
    expect(heading).toBe('Summary log uploads report')

    const totalRowsText = await summaryLogUploadsPage.totalRowsText()
    const totalRows = Number(totalRowsText.replace(/\D+/g, ''))
    expect(totalRows).toBeGreaterThan(0)

    const tableText = await summaryLogUploadsPage.tableText()
    expect(tableText).toContain(seeded.registrationNumber)
    expect(tableText).toContain(seeded.accreditationNumber)

    const csv = await summaryLogUploadsPage.download(
      summaryLogUploadsPage.downloadCsvButton()
    )
    expect(csv.failure).toBeNull()
    expect(csv.filename).toBe(`summary-log-${seededYear}.csv`)
    const csvText = csv.body.toString()
    expect(csvText).toContain('Summary log uploads report')
    expect(csvText).toContain(seeded.registrationNumber)
    expect(csvText).toContain(seeded.accreditationNumber)

    const otherYear = years.find((year) => year !== seededYear)
    if (!otherYear) {
      throw new Error(`No year other than ${seededYear} to show`)
    }
    await summaryLogUploadsPage.showYear(otherYear)

    await expect(page).toHaveURL(
      new RegExp(`/summary-log\\?year=${otherYear}$`)
    )
    await expect(summaryLogUploadsPage.yearDropdown()).toHaveValue(otherYear)
    expect(await summaryLogUploadsPage.pageBodyText()).not.toContain(
      seeded.registrationNumber
    )
  })
})
