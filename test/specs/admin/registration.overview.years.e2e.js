import { test, expect } from '@playwright/test'

import { AdminLoginPage } from 'page-objects/admin/login.page'
import { OrganisationsPage } from 'page-objects/admin/organisations.page'
import { OrganisationOverviewPage } from 'page-objects/admin/organisation.overview.page'
import { RegistrationOverviewPage } from 'page-objects/admin/registration.overview.page'
import { RegistrationYearPage } from 'page-objects/admin/registration.year.page'
import { ReportViewPage } from 'page-objects/admin/report.view.page'
import { seedOrganisationAcrossYears } from '../../support/seeding/organisation.js'
import { seedReportSubmission } from '../../support/seeding/reports.js'
import {
  submitSummaryLogContent,
  summaryLogDatedAt
} from '../../support/seeding/summary-logs.js'
import { registerAndLinkDefraIdUser } from '../../support/defra-id-linking.js'
import { defraIdStub } from '../../support/defra-id-stub.js'
import { summaryLogContentNumbered } from '../../support/spreadsheet/summarylogs-content-generator.js'
import { checkAccessibility } from '../../support/accessibility.js'
import { parseCsvBody } from '../../support/csv.js'

// The registration is registered-only for the two years before this one and
// accredited this year. Last year holds a submitted Quarter 1 report, in a
// period that has ended whatever today's date, and no summary log: it has no
// templates to submit against. This year holds a summary log. Each year page
// downloads that year's waste records; the overview offers none.
test.describe('Registration overview years', () => {
  test.describe.configure({ timeout: 3 * 60 * 1000 })

  test('An admin moves between a registration years and sees each year on its own page @organisations', async ({
    page
  }) => {
    const organisationsPage = new OrganisationsPage(page)
    const organisationOverviewPage = new OrganisationOverviewPage(page)
    const registrationOverviewPage = new RegistrationOverviewPage(page)
    const registrationYearPage = new RegistrationYearPage(page)
    const reportViewPage = new ReportViewPage(page)

    const seeded = await seedOrganisationAcrossYears({
      reprocessingType: 'output'
    })
    const [nextYear, thisYear, lastYear, firstYear] = seeded.years
    const user = await registerAndLinkDefraIdUser(seeded.refNo, seeded.email)
    const defraAuthHeader = defraIdStub.authHeader(user.userId)

    await submitSummaryLogContent(
      seeded.refNo,
      seeded.registrationId,
      defraAuthHeader,
      await summaryLogContentNumbered(
        await summaryLogDatedAt(
          'resources/reprocessor-output.xlsx',
          new Date(Date.UTC(thisYear, 1, 15, 12))
        ),
        {
          regNumber: seeded.registrationNumber,
          accNumber: seeded.accreditationNumber
        }
      ),
      thisYear
    )
    await seedReportSubmission(
      seeded.refNo,
      seeded.registrationId,
      defraAuthHeader,
      { year: lastYear, cadence: 'quarterly', period: 1, submissionNumber: 1 }
    )

    const heading = (year, kind) =>
      `${seeded.companyName} - ${seeded.registrationNumber} - ${year} ${kind}`

    await test.step('The overview lists every year, newest first', async () => {
      await new AdminLoginPage(page).loginAsServiceMaintainer()
      await organisationsPage.open()
      await organisationsPage.searchFor(seeded.companyName)
      await organisationsPage.viewLink(1)
      await organisationOverviewPage.viewRegistrationLink(1)

      expect(await registrationOverviewPage.getYearsTableData()).toEqual([
        {
          year: `${nextYear}`,
          accreditationStatus: 'Not accredited',
          accreditationNumber: '-'
        },
        {
          year: `${thisYear}`,
          accreditationStatus: 'approved',
          accreditationNumber: seeded.accreditationNumber
        },
        {
          year: `${lastYear}`,
          accreditationStatus: 'Not accredited',
          accreditationNumber: '-'
        },
        {
          year: `${firstYear}`,
          accreditationStatus: 'Not accredited',
          accreditationNumber: '-'
        }
      ])
      await expect(
        page.locator('.govuk-summary-list dt', { hasText: 'Waste records' })
      ).toHaveCount(0)
    })

    await test.step('A registered-only year shows only that year', async () => {
      await registrationOverviewPage.viewYear(lastYear)
      await checkAccessibility(page, 'Registered-only year')

      await expect(page).toHaveURL(new RegExp(`/registered-only/${lastYear}$`))
      expect(await registrationYearPage.getHeaderText()).toEqual(
        heading(lastYear, 'registered only')
      )
      await expect(registrationYearPage.prnActivityDownloadLink()).toHaveCount(
        0
      )
      await expect(registrationYearPage.wasteBalanceEventsLink()).toHaveCount(0)

      const reports = await registrationYearPage.getReportsTableData()
      expect(reports.map((row) => row.period).sort()).toEqual([
        'Quarter 1',
        'Quarter 2',
        'Quarter 3',
        'Quarter 4'
      ])
      const quarterOneRow =
        reports.findIndex((row) => row.period === 'Quarter 1') + 1
      expect(reports[quarterOneRow - 1]).toMatchObject({
        submission: '1',
        status: 'Submitted'
      })

      expect(await registrationYearPage.getSummaryLogsContent()).toContain(
        'No summary logs'
      )

      const csv = await registrationYearPage.download(
        registrationYearPage.wasteRecordsDownloadLink()
      )
      expect(csv.failure).toBeNull()
      expect(csv.filename).toMatch(
        new RegExp(`^${seeded.registrationNumber}-${lastYear}-.+\\.csv$`)
      )
      const [header, ...rows] = parseCsvBody(csv.body.toString('utf8'))
      expect(header).toContain('Registration Number')
      expect(rows.filter((row) => row.some((cell) => cell !== ''))).toEqual([])
    })

    await test.step('A report opens and returns to its year', async () => {
      const reports = await registrationYearPage.getReportsTableData()
      await registrationYearPage.clickOnViewReportLink(
        reports.findIndex((row) => row.period === 'Quarter 1') + 1
      )

      expect(await reportViewPage.getHeaderText()).toEqual(
        `Report – ${lastYear} quarterly period 1 submission 1`
      )
      expect(await reportViewPage.breadcrumbs()).toEqual([
        'Organisations',
        'Organisation overview',
        'Registration overview',
        `${lastYear}`
      ])

      await reportViewPage.crumbLink(`${lastYear}`).click()
      expect(await registrationYearPage.getHeaderText()).toEqual(
        heading(lastYear, 'registered only')
      )
    })

    await test.step('The accredited year shows its accreditation and its own summary log', async () => {
      await registrationYearPage.crumbLink('Registration overview').click()
      await registrationOverviewPage.viewYear(thisYear)

      await expect(page).toHaveURL(new RegExp(`/accreditations/${thisYear}$`))
      expect(await registrationYearPage.getHeaderText()).toEqual(
        heading(thisYear, 'accredited')
      )
      await expect(registrationYearPage.prnActivityDownloadLink()).toBeVisible()
      await expect(registrationYearPage.wasteBalanceEventsLink()).toBeVisible()
      expect(
        (await registrationYearPage.getSummaryLogActionLinks(1)).map(
          (link) => link.text
        )
      ).toEqual(['View data', 'Download'])

      const csv = await registrationYearPage.download(
        registrationYearPage.wasteRecordsDownloadLink()
      )
      expect(csv.failure).toBeNull()
      expect(csv.filename).toMatch(
        new RegExp(`^${seeded.registrationNumber}-${thisYear}-.+\\.csv$`)
      )
      const [header, ...rows] = parseCsvBody(csv.body.toString('utf8'))
      const records = rows.filter((row) => row.some((cell) => cell !== ''))
      expect(records.length).toBeGreaterThan(0)
      const registrationColumn = header.indexOf('Registration Number')
      expect(new Set(records.map((row) => row[registrationColumn]))).toEqual(
        new Set([seeded.registrationNumber])
      )
    })

    await test.step('A year opened as the wrong kind is not found', async () => {
      const response = await page.goto(
        page
          .url()
          .replace(`/accreditations/${thisYear}`, `/accreditations/${lastYear}`)
      )
      expect(response?.status()).toBe(404)
    })
  })
})
