import { test, expect } from '@playwright/test'
import { ChooseYearPage } from 'page-objects/choose.year.page.js'
import { DashboardPage } from 'page-objects/dashboard.page.js'
import { HomePage } from 'page-objects/homepage.js'
import { ReportDetailPage } from 'page-objects/reports/report.detail.page.js'
import { ReportsPage } from 'page-objects/reports/reports.page.js'
import { TonnesRecycledPage } from 'page-objects/reports/tonnes.recycled.page.js'
import { WasteRecordsPage } from 'page-objects/waste.records.page.js'
import { UploadSummaryLogPage } from 'page-objects/upload.summary.log.page.js'
import {
  reportsLandingHasNoClosedPeriod,
  seedExternalAccreditation,
  seedOrganisationAcrossYears
} from '~/test/support/seeding/organisation.js'
import { createLinkAndLogin } from '~/test/support/login-helper.js'
import { currentYear, latestOpenYear } from '~/test/support/date.js'
import { defraIdStub } from '~/test/support/defra-id-stub.js'
import {
  fetchYearCalendar,
  reportingPeriodsOf
} from '~/test/support/seeding/year-calendar.js'
import {
  submitSummaryLogContent,
  summaryLogDatedAt
} from '~/test/support/seeding/summary-logs.js'
import { summaryLogContentNumbered } from '~/test/support/spreadsheet/summarylogs-content-generator.js'
import { generateSpreadsheetData } from '~/test/support/spreadsheet/summarylogs-spreadsheet-data-generator.js'
import { checkBodyText } from '~/test/support/checks.js'
import { checkOnUploadPage } from '~/test/support/summary-log-checks.js'
import { expectPeriodYear } from 'page-objects/reports/report-period.js'

/**
 * @param {{ reportingPeriods: { year: number }[] } | undefined} kind
 * @param {number} year
 */
const expectReportsOnlyFor = (kind, year) =>
  expect(
    new Set(kind?.reportingPeriods.map((period) => period.year))
  ).toStrictEqual(new Set([year]))

test.describe('Navigate across years @navigateAcrossYears', () => {
  test.describe('organisation home', () => {
    test('Organisation home page defaults to the latest year with an active registration', async ({
      page
    }) => {
      const dashboardPage = new DashboardPage(page)
      const { refNo, email } = await seedOrganisationAcrossYears()

      await createLinkAndLogin(page, refNo, email)

      await expect(dashboardPage.yearHeading()).toHaveText(
        `This is ${currentYear()} data`
      )
      expect(await dashboardPage.getRegistrationStatus(1, 1)).toBe('Approved')
      expect(await dashboardPage.getAccreditationStatus(1, 1)).toBe('Approved')
    })

    test('Choosing a different year shows the organisation as it was then', async ({
      page
    }) => {
      const dashboardPage = new DashboardPage(page)
      const chooseYearPage = new ChooseYearPage(page)
      const { refNo, email, organisationNumber, registrationNumber } =
        await seedOrganisationAcrossYears()
      const yearSelected = currentYear() - 1

      const user = await createLinkAndLogin(page, refNo, email)
      await dashboardPage.chooseDifferentYearLink().click()

      await expect(chooseYearPage.yearOption(currentYear())).not.toBeChecked()

      await chooseYearPage.yearOption(yearSelected).check()
      await chooseYearPage.continueButton().click()

      await dashboardPage.expectYear(yearSelected)
      expect(await dashboardPage.getRegistrationStatus(1, 1)).toBe('Approved')
      expect(await dashboardPage.getAccreditationStatus(1, 1)).toBe(
        'Not accredited'
      )

      const { registeredOnly, accredited } = await fetchYearCalendar(
        { organisationNumber, registrationNumber, year: yearSelected },
        defraIdStub.authHeader(user.userId)
      )
      expectReportsOnlyFor(registeredOnly, yearSelected)
      expect(accredited).toBeUndefined()
    })

    test('Choosing a different year from the Exporting tab keeps the Exporting tab', async ({
      page
    }) => {
      const dashboardPage = new DashboardPage(page)
      const chooseYearPage = new ChooseYearPage(page)
      const { refNo, email } = await seedOrganisationAcrossYears({
        exporting: true
      })
      const yearSelected = currentYear() - 1

      await createLinkAndLogin(page, refNo, email)
      await dashboardPage.exportingTabLink().click()
      await expect(dashboardPage.currentTab()).toHaveText('Exporting')

      await dashboardPage.chooseDifferentYearLink().click()
      await chooseYearPage.backLink().click()
      await expect(page).toHaveURL(
        new RegExp(`/organisations/\\d+/${currentYear()}/exporting$`)
      )
      await expect(dashboardPage.currentTab()).toHaveText('Exporting')

      await dashboardPage.chooseDifferentYearLink().click()
      await chooseYearPage.yearOption(yearSelected).check()
      await chooseYearPage.continueButton().click()

      await expect(page).toHaveURL(
        new RegExp(`/organisations/\\d+/${yearSelected}/exporting$`)
      )
      await dashboardPage.expectYear(yearSelected)
      await expect(dashboardPage.currentTab()).toHaveText('Exporting')
    })

    test('Choosing next year shows the accreditation its source holds for that year', async ({
      page
    }) => {
      const dashboardPage = new DashboardPage(page)
      const chooseYearPage = new ChooseYearPage(page)
      const { refNo, email, registrationNumber } =
        await seedOrganisationAcrossYears()
      await seedExternalAccreditation(registrationNumber, latestOpenYear())

      await createLinkAndLogin(page, refNo, email)
      await dashboardPage.chooseDifferentYearLink().click()
      await chooseYearPage.yearOption(latestOpenYear()).check()
      await chooseYearPage.continueButton().click()

      await dashboardPage.expectYear(latestOpenYear())
      expect(await dashboardPage.getRegistrationStatus(1, 1)).toBe('Approved')
      expect(await dashboardPage.getAccreditationStatus(1, 1)).toBe('Approved')
    })

    test("Each year takes a summary log from its own year's template @summaryLogsAcrossYears", async ({
      page
    }) => {
      const dashboardPage = new DashboardPage(page)
      const chooseYearPage = new ChooseYearPage(page)
      const wasteRecordsPage = new WasteRecordsPage(page)
      const uploadSummaryLogPage = new UploadSummaryLogPage(page)
      const { refNo, email, registrationNumber, accreditationNumber } =
        await seedOrganisationAcrossYears()
      // 2027 is registered-only: accredited uploads are not yet accepted
      // against the external accreditations that hold years from 2027.
      const summaryLogFor = (wasteProcessingType, year) =>
        generateSpreadsheetData({
          wasteProcessingType,
          materialSuffix: 'PA',
          regNumber: registrationNumber,
          accNumber: accreditationNumber,
          numberOfRows: 3,
          year,
          silentLogging: true
        })
      const log2026 = await summaryLogFor('reprocessorInput', 2026)
      const registeredOnlyLog2026 = await summaryLogFor(
        'regOnlyReprocessor',
        2026
      )
      const log2027 = await summaryLogDatedAt(
        await summaryLogFor('regOnlyReprocessor', 2027),
        new Date(Date.UTC(2027, 0, 1, 12))
      )
      const openUploadFor = async (year) => {
        await dashboardPage.chooseDifferentYearLink().click()
        await chooseYearPage.yearOption(year).check()
        await chooseYearPage.continueButton().click()
        await dashboardPage.expectYear(year)
        await dashboardPage.selectTableLink(1, 1)
        await wasteRecordsPage.expectYear(year)
        await wasteRecordsPage.submitSummaryLogLink().click()
        await checkOnUploadPage(page, year)
      }

      await createLinkAndLogin(page, refNo, email)
      await openUploadFor(2026)
      await uploadSummaryLogPage.performUploadAndReturnToHomepage(log2026, 2026)

      await openUploadFor(2027)
      await uploadSummaryLogPage.uploadFile(registeredOnlyLog2026)
      await uploadSummaryLogPage.continue()
      await checkBodyText(
        page,
        'The file you selected is your 2026 summary log.',
        30
      )
      await checkBodyText(
        page,
        'You need to update and upload your 2027 summary log.',
        30
      )

      await uploadSummaryLogPage.performUploadAndReturnToHomepage(log2027, 2027)
    })

    test('A 2025 summary log is refused, since 2025 has no templates', async ({
      page
    }) => {
      const { refNo, email, registrationId, registrationNumber } =
        await seedOrganisationAcrossYears()
      const user = await createLinkAndLogin(page, refNo, email)

      await expect(
        submitSummaryLogContent(
          refNo,
          registrationId,
          defraIdStub.authHeader(user.userId),
          await summaryLogContentNumbered(
            'resources/reprocessor-output-regonly.xlsx',
            { regNumber: registrationNumber }
          ),
          2025
        )
      ).rejects.toThrow('There are no summary log templates for 2025')
    })

    test("This year's reports hold no period from an earlier year, which the early-year report skips rely on", async ({
      page
    }) => {
      const { refNo, email, organisationNumber, registrationNumber } =
        await seedOrganisationAcrossYears()

      const user = await createLinkAndLogin(page, refNo, email)

      const calendar = await fetchYearCalendar(
        { organisationNumber, registrationNumber, year: currentYear() },
        defraIdStub.authHeader(user.userId)
      )
      const periods = reportingPeriodsOf(calendar)
      const removeTheSkips =
        "This year's reports now show a period from another year: remove the reportsLandingHasNoClosedPeriod skips and seed those specs with validFromWithClosedPeriod"
      expect(periods.length > 0, removeTheSkips).toBe(
        !reportsLandingHasNoClosedPeriod('monthly')
      )
      expect(
        periods.filter(
          (/** @type {{ year: number }} */ period) =>
            period.year !== currentYear()
        ),
        removeTheSkips
      ).toStrictEqual([])
    })
  })

  // The previous year is registered-only and this year is accredited. The
  // previous year holds no summary log: it has no templates to submit against.
  test.describe.serial('reports for a chosen year', () => {
    const year = currentYear() - 1

    /** @type {import('@playwright/test').Page} */
    let page
    let organisationNumber

    test.beforeAll(async ({ browser }) => {
      page = await browser.newPage()
      const seeded = await seedOrganisationAcrossYears({
        reprocessingType: 'output'
      })
      organisationNumber = seeded.organisationNumber

      await createLinkAndLogin(page, seeded.refNo, seeded.email)
    })

    test.afterAll(async () => {
      await new HomePage(page).signOutLink().click()
      await page.close()
    })

    test('Manage reports carries the year chosen on home', async () => {
      const dashboardPage = new DashboardPage(page)
      const chooseYearPage = new ChooseYearPage(page)
      const wasteRecordsPage = new WasteRecordsPage(page)
      const reportsPage = new ReportsPage(page)

      await dashboardPage.chooseDifferentYearLink().click()
      await chooseYearPage.yearOption(year).check()
      await chooseYearPage.continueButton().click()
      await dashboardPage.expectYear(year)

      await dashboardPage.selectTableLink(1, 1)
      await wasteRecordsPage.expectYear(year)

      await wasteRecordsPage.manageReportsLink().click()
      await reportsPage.expectListFor(year)
      expect(await reportsPage.getActivePeriodLabel(1)).toBe(
        `Quarter 1, ${year}`
      )
    })

    test('Leaving a report keeps the chosen year', async () => {
      const reportsPage = new ReportsPage(page)
      const reportDetailPage = new ReportDetailPage(page)
      const tonnesRecycledPage = new TonnesRecycledPage(page)

      await reportsPage.selectActiveActionLink(1)
      await expectPeriodYear(page, year)
      await reportDetailPage.cancelAndReturnToReports()
      await reportsPage.expectListFor(year)

      await reportsPage.selectActiveActionLink(1)
      await reportDetailPage.useThisData()
      await expectPeriodYear(page, year)
      await tonnesRecycledPage.backLink().click()
      await reportsPage.expectListFor(year)
    })

    test('Back from the reports list returns to the chosen year', async () => {
      await new ReportsPage(page).backLink().click()
      await new WasteRecordsPage(page).expectYear(year)
    })

    test('Changing year from home moves the reports with it', async () => {
      const dashboardPage = new DashboardPage(page)
      const chooseYearPage = new ChooseYearPage(page)
      const wasteRecordsPage = new WasteRecordsPage(page)

      await dashboardPage.open(organisationNumber)
      await dashboardPage.chooseDifferentYearLink().click()
      await chooseYearPage.yearOption(currentYear()).check()
      await chooseYearPage.continueButton().click()
      await dashboardPage.expectYear(currentYear())

      await dashboardPage.selectTableLink(1, 1)
      await wasteRecordsPage.expectYear(currentYear())
      await expect(page).toHaveURL(
        new RegExp(`/accreditations/${currentYear()}$`)
      )

      await wasteRecordsPage.manageReportsLink().click()
      await new ReportsPage(page).expectListFor(currentYear())
    })
  })
})
