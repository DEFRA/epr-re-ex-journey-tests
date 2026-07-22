import { browser, expect } from '@wdio/globals'
import HomePage from 'page-objects/homepage.js'
import UploadSummaryLogPage from '../page-objects/upload.summary.log.page.js'
import CheckSummaryLogPage from '../page-objects/check.summary.log.page.js'
import WasteRecordsPage from '../page-objects/waste.records.page.js'
import DashboardPage from '../page-objects/dashboard.page.js'
import {
  checkBodyText,
  checkBodyTextDoesNotInclude
} from '../support/checks.js'
import {
  seedOverseasSites,
  createLinkedOrganisation,
  updateMigratedOrganisation,
  seedSubmittedReport
} from '../support/apicalls.js'
import {
  createLinkAndLogin,
  registerAndLinkDefraIdUser,
  loginViaHomePage
} from '../support/login-helper.js'

// PAE-1648 closed-period adjustment messaging copy (en.json
// summary-log:closedPeriodAdjustments), asserted verbatim by the closed-period
// messaging tests below.
const IMPORTANT_BODY =
  "If you upload this summary log, you'll need to create a new report for any relevant period and an approved person from your business will need to resubmit it to your regulator."
const FURTHER_ACTION_HEADING = 'Further action needed'
const FURTHER_ACTION_PARA_1 =
  "Data from a period that you had already reported on has been changed, so you'll need to create a new report."
const FURTHER_ACTION_PARA_2 =
  'Once the new report has been created, an approved person from your business will need to submit it to your regulator.'
const FURTHER_ACTION_PARA_3 =
  "Reports that need to be resubmitted to your regulator show the status 'Requires resubmission' on the reports page."

// Split from summarylogs.check.cma.e2e.js (PAE-1405 CI runtime work): this
// group covers the "Important" banner and "Further action needed" messaging
// that renders when closed-period adjustments are detected. See
// summarylogs.check.cma.sections.e2e.js for open/closed section visibility
// and summarylogs.check.cma.adjusted-loads.e2e.js for adjusted-load sub-state
// rendering. Splitting lets wdio's per-file worker scheduling run these in
// parallel instead of serially in one ~4 minute file. The "no changes" case
// below is data-driven, so it stays alongside the "detected" case.
describe('Summary Logs - Check Page with CMA Detection - Closed-period Adjustment Messaging', () => {
  // Resets the shared browser session between tests. Without it, leftover auth
  // state makes a later "start now" auto-log-in and skip the stub's user-selection
  // page, so loginViaEmail times out (passes solo, fails in suite). deleteCookies
  // alone was not enough.
  afterEach(async () => {
    await browser.reloadSession()
  })

  it('should show the Important banner and Further action needed messaging when closed-period adjustments are detected @closedPeriodMessaging @cma', async () => {
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

    const user = await registerAndLinkDefraIdUser(
      organisationDetails.refNo,
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

    await loginViaHomePage(migrationResponse.email)

    await DashboardPage.selectLink(1)

    await WasteRecordsPage.submitSummaryLogLink()

    await UploadSummaryLogPage.uploadFile(
      'resources/reprocessor-output-regonly-cma.xlsx'
    )
    await UploadSummaryLogPage.continue()

    await checkBodyText('Your summary log is being checked', 30)
    await checkBodyText('Upload your summary log', 60)

    // The "Important" banner is shown on the check before you submit page.
    const banner = await CheckSummaryLogPage.importantBanner()
    expect(await banner.isExisting()).toBe(true)
    const bannerText = await banner.getText()
    expect(bannerText).toContain('Important')
    expect(bannerText).toContain(IMPORTANT_BODY)

    // Submit inline (not performUploadAndReturnToHomepage, which would click
    // "Return to home" and skip the success-page assertions below).
    await CheckSummaryLogPage.upload()

    await checkBodyText('Your waste records are being updated', 30)
    await checkBodyText('Summary log uploaded', 60)

    // The "Further action needed" section and "Go to reports" button are shown
    // on the success page, and the button links to the reports page.
    await checkBodyText(FURTHER_ACTION_HEADING, 10)
    await checkBodyText(FURTHER_ACTION_PARA_1, 5)
    await checkBodyText(FURTHER_ACTION_PARA_2, 5)
    await checkBodyText(FURTHER_ACTION_PARA_3, 5)
    expect(await UploadSummaryLogPage.goToReportsButton().isExisting()).toBe(
      true
    )
    expect(
      await UploadSummaryLogPage.goToReportsButton().getAttribute('href')
    ).toBe(
      `/organisations/${organisationDetails.refNo}/registrations/${regId}/reports`
    )

    await HomePage.signOut()
    await expect(browser).toHaveTitle(expect.stringContaining('Signed out'))
  })

  it('should not show the Important banner or Further action needed messaging when no closed-period adjustments are detected @closedPeriodMessaging @cma', async () => {
    const organisationDetails = await createLinkedOrganisation([
      { material: 'Paper or board (R3)', wasteProcessingType: 'Reprocessor' },
      { material: 'Paper or board (R3)', wasteProcessingType: 'Exporter' }
    ])

    const migrationResponse = await updateMigratedOrganisation(
      organisationDetails.refNo,
      [
        {
          reprocessingType: 'output',
          regNumber: 'R25SR5111050912PA',
          accNumber: 'ACC123456',
          status: 'approved'
        },
        {
          regNumber: 'E25SR500030913PA',
          accNumber: 'ACC234567',
          status: 'approved',
          validFrom: '2025-02-02'
        }
      ]
    )
    await seedOverseasSites(
      organisationDetails.refNo,
      [1],
      [124, 183, 512, 876]
    )

    await createLinkAndLogin(organisationDetails.refNo, migrationResponse.email)

    await DashboardPage.selectExportingTab()
    await DashboardPage.selectLink(1)

    await WasteRecordsPage.submitSummaryLogLink()

    // Open-period loads only (no submitted report seeded), so no closed-period
    // adjustments are detected.
    await UploadSummaryLogPage.uploadFile('resources/exporter.xlsx')
    await UploadSummaryLogPage.continue()

    await checkBodyText('Your summary log is being checked', 30)
    await checkBodyText('Upload your summary log', 60)

    expect(await CheckSummaryLogPage.importantBanner().isExisting()).toBe(false)
    await checkBodyTextDoesNotInclude(IMPORTANT_BODY, 5)

    await CheckSummaryLogPage.upload()

    await checkBodyText('Your waste records are being updated', 30)
    await checkBodyText('Summary log uploaded', 60)

    await checkBodyTextDoesNotInclude(FURTHER_ACTION_HEADING, 5)
    expect(await UploadSummaryLogPage.goToReportsButton().isExisting()).toBe(
      false
    )

    await HomePage.signOut()
    await expect(browser).toHaveTitle(expect.stringContaining('Signed out'))
  })
})
