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

test.describe('Reports - make changes to a submitted report @makeChanges', () => {
  test('shows the make changes button on the latest submitted report and lets the operator cancel or upload a new summary log without triggering resubmission @makeChangesCancel @makeChangesUploadNewSummaryLog', async ({
    page
  }) => {
    const defraIdStubPage = new DefraIdStubPage(page)
    const homePage = new HomePage(page)
    const uploadSummaryLogPage = new UploadSummaryLogPage(page)
    const wasteRecordsPage = new WasteRecordsPage(page)
    const dashboardPage = new DashboardPage(page)
    const reportsPage = new ReportsPage(page)
    const reportViewPage = new ReportViewPage(page)
    const makeChangesPage = new MakeChangesPage(page)

    const { migrationResponse } = await seedSubmittedRegisteredReprocessor()

    await homePage.open()
    await homePage.clickStartNow()
    await defraIdStubPage.loginViaEmail(migrationResponse.email)

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

    await homePage.signOut()
    await expect(page).toHaveTitle(/Signed out/)
  })

  test('creates a resubmission draft from the make changes button @makeChangesUseSummaryLog', async ({
    page
  }) => {
    const defraIdStubPage = new DefraIdStubPage(page)
    const homePage = new HomePage(page)
    const wasteRecordsPage = new WasteRecordsPage(page)
    const dashboardPage = new DashboardPage(page)
    const reportsPage = new ReportsPage(page)
    const reportViewPage = new ReportViewPage(page)
    const makeChangesPage = new MakeChangesPage(page)
    const reportDetailPage = new ReportDetailPage(page)
    const tonnesRecycledPage = new TonnesRecycledPage(page)

    const { organisationDetails, migrationResponse, regId } =
      await seedSubmittedRegisteredReprocessor()

    await homePage.open()
    await homePage.clickStartNow()
    await defraIdStubPage.loginViaEmail(migrationResponse.email)

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

    await homePage.signOut()
    await expect(page).toHaveTitle(/Signed out/)
  })
})
