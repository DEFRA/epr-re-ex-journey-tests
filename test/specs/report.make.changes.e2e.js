import { test, expect } from '@playwright/test'
import { DefraIdStubPage } from 'page-objects/defra.id.stub.page.js'
import { HomePage } from 'page-objects/homepage.js'
import { WasteRecordsPage } from '../page-objects/waste.records.page.js'
import { DashboardPage } from '../page-objects/dashboard.page.js'
import { ReportsPage } from 'page-objects/reports/reports.page.js'
import { ReportViewPage } from 'page-objects/reports/report.view.page.js'
import { MakeChangesPage } from 'page-objects/reports/make.changes.page.js'
import { ReportDetailPage } from 'page-objects/reports/report.detail.page.js'
import { ResubmissionExplainerPage } from 'page-objects/reports/resubmission.explainer.page.js'
import { TonnesRecycledPage } from 'page-objects/reports/tonnes.recycled.page.js'
import { checkBodyText } from '../support/checks.js'
import { checkOnUploadPage } from '../support/summary-log-checks.js'
import { checkAccessibility } from '../support/accessibility.js'
import {
  createAndRegisterDefraIdUser,
  linkDefraIdUser
} from '../support/defra-id-linking.js'
import {
  createLinkedOrganisation,
  updateMigratedOrganisation
} from '../support/seeding/organisation.js'
import { seedSubmittedReport } from '../support/seeding/reports.js'
import { generateRegNumber } from '../support/reg-acc-number.js'

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
        regNumber: generateRegNumber({
          wasteProcessingType: 'reprocessor',
          materialSuffix: 'PA'
        }),
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

test.describe('Reports - make changes to a submitted report @makeChanges @operatorResubmissionExplainer', () => {
  test('backs out of making changes, then starts them, leaves, and returns through the operator-initiated explainer to create a resubmission draft @makeChangesCancel @makeChangesUploadNewSummaryLog @makeChangesUseSummaryLog @makeChangesOperatorExplainer', async ({
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
    const resubmissionExplainerPage = new ResubmissionExplainerPage(page)
    const tonnesRecycledPage = new TonnesRecycledPage(page)

    const { organisationDetails, migrationResponse, regId } =
      await seedSubmittedRegisteredReprocessor()

    await homePage.open()
    await checkAccessibility(page, 'Home page')
    await homePage.startNowButton().click()
    await defraIdStubPage.loginViaEmail(migrationResponse.email)

    // --- Make changes, then back out without triggering resubmission ---
    await dashboardPage.selectLink(1)
    await wasteRecordsPage.manageReportsLink().click()

    expect(await reportsPage.getSubmittedStatusBadge(1)).toBe('Submitted')
    await reportsPage.selectSubmittedActionLink(1)

    expect(await reportViewPage.headingText()).toContain('Report for')
    await reportViewPage.makeChangesLink().click()

    expect(await makeChangesPage.headingText()).toContain(
      'need to resubmit this report'
    )
    await makeChangesPage.uploadNewSummaryLog()
    await checkOnUploadPage(page)

    await page.goBack()
    await makeChangesPage.cancel()
    expect(await reportViewPage.headingText()).toContain('Report for')

    await homePage.homeLink().click()
    await dashboardPage.selectLink(1)
    await wasteRecordsPage.manageReportsLink().click()
    expect(await reportsPage.getSubmittedStatusBadge(1)).toBe('Submitted')

    // --- Start the changes, then leave without using the data ---
    // "Use this report's summary log" flags the submitted report for
    // resubmission (operator-initiated) and redirects to the new draft's detail
    // page without creating the draft. Leaving without using the data keeps the
    // period in a "Requires resubmission" state with no draft in progress.
    await reportsPage.selectSubmittedActionLink(1)
    await reportViewPage.makeChangesLink().click()

    await makeChangesPage.useThisReportsSummaryLogAndCheckDoubleClickPrevented()
    expect(await reportDetailPage.headingText()).toContain(
      'Your summary log data'
    )

    // Back on the reports landing the period requires resubmission with a
    // "Review and create draft" CTA that leads to the explainer.
    await homePage.homeLink().click()
    await dashboardPage.selectLink(1)
    await wasteRecordsPage.manageReportsLink().click()
    expect(await reportsPage.getActiveStatusBadge(1)).toBe(
      'Requires resubmission'
    )
    await reportsPage.selectActiveActionLinkByText(1, 'Review and create draft')

    // Operator-initiated copy: the heading drops the "Why" prefix (the
    // closed-period variant in reports.requires.resubmission.e2e.js keeps it)
    // and para 1 explains the operator started changes but did not resubmit.
    const heading = await resubmissionExplainerPage.headingText()
    expect(heading).toMatch(/^Your .+ report needs to be resubmitted$/)
    await checkBodyText(
      page,
      'You started to make changes to the report, but did not resubmit the new draft.',
      10
    )

    // --- Create the resubmission draft ---
    await resubmissionExplainerPage.continue()

    expect(await reportDetailPage.headingText()).toContain(
      'Your summary log data'
    )
    await reportDetailPage.useThisData()

    expect(await tonnesRecycledPage.headingText()).toBeTruthy()

    // The submitted report no longer offers to make changes once a
    // resubmission draft exists.
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

    await homePage.signOutLink().click()
    await expect(page).toHaveTitle(/Signed out/)
  })
})
