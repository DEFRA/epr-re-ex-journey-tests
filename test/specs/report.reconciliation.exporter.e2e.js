import { browser, expect } from '@wdio/globals'
import DefraIdStubPage from 'page-objects/defra.id.stub.page.js'
import HomePage from 'page-objects/homepage.js'
import DashboardPage from '../page-objects/dashboard.page.js'
import WasteRecordsPage from '../page-objects/waste.records.page.js'
import UploadSummaryLogPage from 'page-objects/upload.summary.log.page.js'
import ReportDetailPage from 'page-objects/reports/report.detail.page.js'
import {
  seedOverseasSites,
  createAndRegisterDefraIdUser,
  createLinkedOrganisation,
  linkDefraIdUser,
  updateMigratedOrganisation
} from '../support/apicalls.js'
import { parseTonnage } from '../support/tonnage.js'

// PAE-1668 UI regression guard. The fixture keeps four clean February 2026
// exporter loads whose exported tonnages carry more than two decimal places, so
// round-each-then-sum (waste balance and correct report) differs from
// sum-then-round (the bug). This spec confirms the two figures a user sees — the
// displayed report exported total and the displayed waste balance — agree.
//
// The exact-number reconciliation (report total === balance amount, and the
// no-PRN precondition) is guarded faster at the API tier in
// epr-backend-journey-tests (reports-reconciliation-exporter.feature); the
// browser is only needed here to confirm the rendered figures match.
//
// Single submission, single period, no PRNs — the only case where a period
// report total equals the whole-submission waste balance.
//
// The round-each-then-sum total the fixture produces, printed by
// generate-reconciliation-fixtures.mjs (which also refuses to emit a fixture
// where round-each-then-sum and sum-then-round agree).
const EXPECTED_RECONCILED_TONNAGE = 8.03
const YEAR = 2026
const CADENCE = 'monthly'
const PERIOD = 2 // fixture loads are dated February 2026

describe('Report tonnage reconciles with the waste balance — exporter @reconciliation', () => {
  const regNumber = 'E25SR500020912PA'
  const accNumber = 'E-ACC12245PA'

  let organisationDetails
  let migrationResponse
  let user

  before(async () => {
    organisationDetails = await createLinkedOrganisation([
      {
        material: 'Paper or board (R3)',
        wasteProcessingType: 'Exporter'
      }
    ])

    migrationResponse = await updateMigratedOrganisation(
      organisationDetails.refNo,
      [{ regNumber, accNumber, status: 'approved' }]
    )

    await seedOverseasSites(organisationDetails.refNo)

    user = await createAndRegisterDefraIdUser(migrationResponse.email)
    await linkDefraIdUser(
      organisationDetails.refNo,
      user.userId,
      migrationResponse.email
    )

    await HomePage.openStart()
    await HomePage.clickStartNow()
    await DefraIdStubPage.loginViaEmail(migrationResponse.email)

    await DashboardPage.selectTableLink(1, 1)
    await WasteRecordsPage.submitSummaryLogLink()
    await UploadSummaryLogPage.performUploadAndReturnToHomepage(
      'resources/exporter-reconciliation.xlsx'
    )
  })

  after(async () => {
    await HomePage.signOut()
    await expect(browser).toHaveTitle(expect.stringContaining('Signed out'))
  })

  it('displayed report total matches the displayed waste balance (UI) @reconciliationExporterUi', async () => {
    await DashboardPage.selectTableLink(1, 1)
    const balanceText = await WasteRecordsPage.wasteBalanceAmount()

    // Go straight to the February period the fixture loads belong to, rather
    // than the first actionable report (whose period is not guaranteed).
    await ReportDetailPage.open(
      organisationDetails.refNo,
      migrationResponse.registrationIds[0],
      YEAR,
      CADENCE,
      PERIOD
    )
    const reportTotalText = await ReportDetailPage.totalTonnageExported()

    expect(parseTonnage(reportTotalText)).toEqual(parseTonnage(balanceText))
    expect(parseTonnage(reportTotalText)).toEqual(EXPECTED_RECONCILED_TONNAGE)
  })
})
