import { browser, expect } from '@wdio/globals'
import DefraIdStubPage from 'page-objects/defra.id.stub.page.js'
import HomePage from 'page-objects/homepage.js'
import UploadSummaryLogPage from '../page-objects/upload.summary.log.page.js'
import WasteRecordsPage from '../page-objects/waste.records.page.js'
import DashboardPage from '../page-objects/dashboard.page.js'
import ReportsPage from 'page-objects/reports/reports.page.js'
import ReportViewPage from 'page-objects/reports/report.view.page.js'
import MakeChangesPage from 'page-objects/reports/make.changes.page.js'
import ReportDetailPage from 'page-objects/reports/report.detail.page.js'
import TonnesRecycledPage from 'page-objects/reports/tonnes.recycled.page.js'
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

describe('Reports - make changes to a submitted report @makeChanges', () => {
  afterEach(async () => {
    await browser.reloadSession()
  })

  it('shows the make changes button on the latest submitted report and lets the operator cancel or upload a new summary log without triggering resubmission @makeChangesCancel @makeChangesUploadNewSummaryLog', async () => {
    const { migrationResponse } = await seedSubmittedRegisteredReprocessor()

    await HomePage.open()
    await HomePage.clickStartNow()
    await DefraIdStubPage.loginViaEmail(migrationResponse.email)

    await DashboardPage.selectLink(1)
    await WasteRecordsPage.manageReportsLink()

    expect(await ReportsPage.getSubmittedStatusBadge(1)).toBe('Submitted')
    await ReportsPage.selectSubmittedActionLink(1)

    expect(await ReportViewPage.headingText()).toContain('Report for')
    await ReportViewPage.makeChangesLink()

    expect(await MakeChangesPage.headingText()).toContain(
      'need to resubmit this report'
    )
    await MakeChangesPage.uploadNewSummaryLog()
    expect(await UploadSummaryLogPage.headingText()).toContain(
      'Upload your summary log'
    )

    await browser.back()
    await MakeChangesPage.cancel()
    expect(await ReportViewPage.headingText()).toContain('Report for')

    await HomePage.homeLink()
    await DashboardPage.selectLink(1)
    await WasteRecordsPage.manageReportsLink()
    expect(await ReportsPage.getSubmittedStatusBadge(1)).toBe('Submitted')

    await HomePage.signOut()
    await expect(browser).toHaveTitle(expect.stringContaining('Signed out'))
  })

  it('creates a resubmission draft from the make changes button @makeChangesUseSummaryLog', async () => {
    const { organisationDetails, migrationResponse, regId } =
      await seedSubmittedRegisteredReprocessor()

    await HomePage.open()
    await HomePage.clickStartNow()
    await DefraIdStubPage.loginViaEmail(migrationResponse.email)

    await DashboardPage.selectLink(1)
    await WasteRecordsPage.manageReportsLink()

    await ReportsPage.selectSubmittedActionLink(1)
    await ReportViewPage.makeChangesLink()

    await MakeChangesPage.useThisReportsSummaryLogAndCheckDoubleClickPrevented()

    expect(await ReportDetailPage.headingText()).toContain(
      'Your summary log data'
    )
    await ReportDetailPage.useThisData()

    expect(await TonnesRecycledPage.headingText()).toBeTruthy()

    await ReportViewPage.open(
      organisationDetails.refNo,
      regId,
      2026,
      'quarterly',
      1,
      1
    )
    expect(await ReportViewPage.headingText()).toContain('Report for')
    expect(await ReportViewPage.hasMakeChangesLink()).toBe(false)

    await HomePage.signOut()
    await expect(browser).toHaveTitle(expect.stringContaining('Signed out'))
  })
})
