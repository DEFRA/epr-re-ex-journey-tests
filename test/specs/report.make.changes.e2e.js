import { test, expect } from '@playwright/test'
import { DefraIdStubPage } from 'page-objects/defra.id.stub.page.js'
import { HomePage } from 'page-objects/homepage.js'
import { UploadSummaryLogPage } from '../page-objects/upload.summary.log.page.js'
import { WasteRecordsPage } from '../page-objects/waste.records.page.js'
import { DashboardPage } from '../page-objects/dashboard.page.js'
import { ReportsPage } from 'page-objects/reports/reports.page.js'
import { ReportViewPage } from 'page-objects/reports/report.view.page.js'
import { MakeChangesPage } from 'page-objects/reports/make.changes.page.js'
import { ReportDetailPage } from 'page-objects/reports/report.detail.page.js'
import { TonnesRecycledPage } from 'page-objects/reports/tonnes.recycled.page.js'
import {
  createAndRegisterDefraIdUser,
  createLinkedOrganisation,
  linkDefraIdUser,
  updateMigratedOrganisation,
  seedSubmittedReport
} from '../support/apicalls.js'

async function seedSubmittedRegisteredReprocessor() {
  const organisationDetails = await createLinkedOrganisation([
    {
      material: 'Paper or board (R3)',
      wasteProcessingType: 'Reprocessor',
      withoutAccreditation: true
    }
  ])

  const migrationResponse = await updateMigratedOrganisation(
    organisationDetails.refNo,
    [
      {
        reprocessingType: 'output',
        regNumber: 'R25SR500040912PA',
        status: 'approved',
        withoutAccreditation: true
      }
    ]
  )

  const user = await createAndRegisterDefraIdUser(migrationResponse.email)
  await linkDefraIdUser(
    organisationDetails.refNo,
    user.userId,
    migrationResponse.email
  )

  const regId = migrationResponse.registrationIds[0]

  await seedSubmittedReport(
    organisationDetails.refNo,
    regId,
    user.userId,
    2026,
    'quarterly',
    1,
    1,
    { tonnageRecycled: 100, tonnageNotRecycled: 0 }
  )

  return { organisationDetails, migrationResponse, regId }
}

// Both tests below share one continuous login session/report (same pattern as
// registered.exporter.report.e2e.js): the "cancel" test only backs out of the
// make-changes flow without mutating the report, so it's safe to run first,
// then the "use this report's summary log" test mutates it into a
// resubmission draft second, in the same shared org/login.
test.describe
  .serial('Reports - make changes to a submitted report @makeChanges', () => {
  /** @type {import('@playwright/test').Page} */
  let page
  let organisationDetails
  let migrationResponse
  let regId

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage()

    ;({ organisationDetails, migrationResponse, regId } =
      await seedSubmittedRegisteredReprocessor())

    const defraIdStubPage = new DefraIdStubPage(page)
    const homePage = new HomePage(page)

    await homePage.open()
    await homePage.clickStartNow()
    await defraIdStubPage.loginViaEmail(migrationResponse.email)
  })

  test.afterAll(async () => {
    const homePage = new HomePage(page)
    await homePage.signOut()
    await expect(page).toHaveTitle(/Signed out/)
    await page.close()
  })

  test('shows the make changes button on the latest submitted report and lets the operator cancel or upload a new summary log without triggering resubmission @makeChangesCancel @makeChangesUploadNewSummaryLog', async () => {
    const uploadSummaryLogPage = new UploadSummaryLogPage(page)
    const wasteRecordsPage = new WasteRecordsPage(page)
    const dashboardPage = new DashboardPage(page)
    const reportsPage = new ReportsPage(page)
    const reportViewPage = new ReportViewPage(page)
    const makeChangesPage = new MakeChangesPage(page)
    const homePage = new HomePage(page)

    await dashboardPage.selectLink(1)
    await wasteRecordsPage.manageReportsLink()

    expect(await reportsPage.getSubmittedStatusBadge(1)).toBe('Submitted')
    await reportsPage.selectSubmittedActionLink(1)

    expect(await reportViewPage.headingText()).toContain('Report for')
    await reportViewPage.makeChangesLink()

    expect(await makeChangesPage.headingText()).toContain(
      'need to resubmit this report'
    )
    await makeChangesPage.uploadNewSummaryLog()
    expect(await uploadSummaryLogPage.headingText()).toContain(
      'Upload your summary log'
    )

    await page.goBack()
    await makeChangesPage.cancel()
    expect(await reportViewPage.headingText()).toContain('Report for')

    await homePage.homeLink()
    await dashboardPage.selectLink(1)
    await wasteRecordsPage.manageReportsLink()
    expect(await reportsPage.getSubmittedStatusBadge(1)).toBe('Submitted')
  })

  test('creates a resubmission draft from the make changes button @makeChangesUseSummaryLog', async () => {
    const homePage = new HomePage(page)
    const wasteRecordsPage = new WasteRecordsPage(page)
    const dashboardPage = new DashboardPage(page)
    const reportsPage = new ReportsPage(page)
    const reportViewPage = new ReportViewPage(page)
    const makeChangesPage = new MakeChangesPage(page)
    const reportDetailPage = new ReportDetailPage(page)
    const tonnesRecycledPage = new TonnesRecycledPage(page)

    // The previous test ends on the reports page (not the dashboard), so
    // reset to a known starting point before selecting the org link.
    await homePage.homeLink()
    await dashboardPage.selectLink(1)
    await wasteRecordsPage.manageReportsLink()

    await reportsPage.selectSubmittedActionLink(1)
    await reportViewPage.makeChangesLink()

    await makeChangesPage.useThisReportsSummaryLogAndCheckDoubleClickPrevented()

    expect(await reportDetailPage.headingText()).toContain(
      'Your summary log data'
    )
    await reportDetailPage.useThisData()

    expect(await tonnesRecycledPage.headingText()).toBeTruthy()

    await reportViewPage.open(
      organisationDetails.refNo,
      regId,
      2026,
      'quarterly',
      1,
      1
    )
    expect(await reportViewPage.headingText()).toContain('Report for')
    expect(await reportViewPage.hasMakeChangesLink()).toBe(false)
  })
})
