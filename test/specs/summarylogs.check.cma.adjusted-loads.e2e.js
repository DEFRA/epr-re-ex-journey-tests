import { browser, expect } from '@wdio/globals'
import HomePage from 'page-objects/homepage.js'
import UploadSummaryLogPage from '../page-objects/upload.summary.log.page.js'
import CheckSummaryLogPage from '../page-objects/check.summary.log.page.js'
import WasteRecordsPage from '../page-objects/waste.records.page.js'
import DashboardPage from '../page-objects/dashboard.page.js'
import { checkBodyText } from '../support/checks.js'
import {
  seedOverseasSites,
  createLinkedOrganisation,
  updateMigratedOrganisation,
  seedSubmittedReport
} from '../support/apicalls.js'
import { createLinkAndLogin } from '../support/login-helper.js'

// The adjusted-loads accordion splits each balance-affecting load by the
// direction it moved the waste balance: added loads carry one heading, reduced
// loads another. MISSING_DATA_HEADING is the pre-fix copy PAE-1743 removed,
// asserted absent by the reduced-reason test below.
const ADJUSTED_ADDED_HEADING = 'This load has added to your waste balance'
const ADJUSTED_REDUCED_HEADING = 'This load has reduced your waste balance'
const MISSING_DATA_HEADING = 'does NOT have all the required summary log data'

// Split from summarylogs.check.cma.e2e.js (PAE-1405 CI runtime work): this
// group covers adjusted-load sub-state rendering (headings, accordions,
// balance projections). See summarylogs.check.cma.sections.e2e.js for
// open/closed section visibility and summarylogs.check.cma.messaging.e2e.js
// for the closed-period banner/messaging copy. Splitting lets wdio's per-file
// worker scheduling run these in parallel instead of serially in one
// ~4 minute file.
describe('Summary Logs - Check Page with CMA Detection - Adjusted Loads', () => {
  // Resets the shared browser session between tests. Without it, leftover auth
  // state makes a later "start now" auto-log-in and skip the stub's user-selection
  // page, so loginViaEmail times out (passes solo, fails in suite). deleteCookies
  // alone was not enough.
  afterEach(async () => {
    await browser.reloadSession()
  })

  it('should display closed period adjusted loads when a reported load is amended @cmaAdjusted @cma', async () => {
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

    const user = await createLinkAndLogin(
      organisationDetails.refNo,
      migrationResponse.email
    )

    await DashboardPage.selectExportingTab()
    await DashboardPage.selectLink(1)

    await WasteRecordsPage.submitSummaryLogLink()
    await UploadSummaryLogPage.performUploadAndReturnToHomepage(
      'resources/exporter.xlsx'
    )

    const exporterRegId = migrationResponse.registrationIds[1]
    await seedSubmittedReport(
      organisationDetails.refNo,
      exporterRegId,
      user.userId,
      2026,
      'monthly',
      1,
      1,
      { prnRevenue: 100, freeTonnage: 0 }
    )

    await DashboardPage.selectExportingTab()
    await DashboardPage.selectLink(1)
    await WasteRecordsPage.submitSummaryLogLink()
    await UploadSummaryLogPage.uploadFile('resources/exporter-adjustments.xlsx')
    await UploadSummaryLogPage.continue()

    await checkBodyText('Your summary log is being checked', 30)
    await checkBodyText('Upload your summary log', 60)

    await checkBodyText('Closed periods: adjusted loads', 30)

    const sections = await CheckSummaryLogPage.allSectionHeadings()
    expect(sections).toEqual(
      expect.arrayContaining([
        'Open periods: new loads',
        'Closed periods: new loads',
        'Closed periods: adjusted loads'
      ])
    )

    const subStates = (await CheckSummaryLogPage.allSubStateHeadings()).join(
      ' | '
    )
    expect(subStates).toContain(
      '1 new load will be recorded (and will add to your waste balance)'
    )
    expect(subStates).toContain(
      '2 new loads will be recorded (and will add to your waste balance)'
    )
    expect(subStates).toContain(
      '1 new load will be recorded (but will NOT add to your waste balance)'
    )
    expect(subStates).toContain(
      '1 adjusted load will be recorded (and will reflect in your waste balance)'
    )
    expect(subStates).toContain(
      '1 change is NOT relevant to your waste balance'
    )

    // Guard on the projection (renders last, at page bottom) so the raw read
    // below isn't taken mid-parse; the expect()s keep the value diagnostics.
    await checkBodyText(
      'If you upload this summary log to create a new report, your waste balance will be 139.00 (from 30.00)',
      10
    )
    const bodyText = await browser.execute(() => document.body.innerText)
    // Open and closed new-loads sections each render their own caption, so two
    // "new loads will add" lines are expected here, not one.
    expect(bodyText).toContain(
      'The new loads will add 49.00 tonnes to your waste balance.'
    )
    expect(bodyText).toContain(
      'The new loads will add 50.00 tonnes to your waste balance.'
    )
    expect(bodyText).toContain(
      'The adjusted loads will add 10.00 tonnes to your waste balance.'
    )
    expect(bodyText).toContain(
      'The loads include all the required summary log data.'
    )
    expect(bodyText).toContain('depending on the adjustment.')
    expect(bodyText).toContain(
      'If you upload this summary log to create a new report, your waste balance will be 139.00 (from 30.00)'
    )

    await CheckSummaryLogPage.expandAllLoadDetails()
    const rows = await CheckSummaryLogPage.loadRowItems()
    expect(rows.some((r) => r.includes('Row ID'))).toBe(true)
    const detailsText = await CheckSummaryLogPage.loadDetailsText()
    expect(detailsText).toContain(ADJUSTED_ADDED_HEADING)

    await HomePage.signOut()
    await expect(browser).toHaveTitle(expect.stringContaining('Signed out'))
  })

  // The "should display open period adjusted loads and sub-states with
  // accordions @openAdjusted" case used to live here, but its org/upload
  // setup was byte-for-byte identical to summarylogs.exporter.e2e.js's
  // happy-path test (both stages), just to assert the check page's
  // sub-state/accordion content and pre-submit balance projection at stage
  // 2 - merged there instead.

  it('should display the registered-only adjusted-loads copy @regOnlyAdjusted @cma', async () => {
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
          regNumber: 'R25SR5111050912PA',
          status: 'approved',
          withoutAccreditation: true
        }
      ]
    )

    await createLinkAndLogin(organisationDetails.refNo, migrationResponse.email)

    await DashboardPage.selectLink(1)

    await WasteRecordsPage.submitSummaryLogLink()
    await UploadSummaryLogPage.performUploadAndReturnToHomepage(
      'resources/reprocessor-output-regonly.xlsx'
    )

    await DashboardPage.selectLink(1)
    await WasteRecordsPage.submitSummaryLogLink()
    await UploadSummaryLogPage.uploadFile(
      'resources/reprocessor-output-regonly-adjustments.xlsx'
    )
    await UploadSummaryLogPage.continue()

    await checkBodyText('Your summary log is being checked', 30)
    await checkBodyText('Upload your summary log', 60)
    await checkBodyText('Open periods: adjusted loads', 30)

    const subStates = (await CheckSummaryLogPage.allSubStateHeadings()).join(
      ' | '
    )
    expect(subStates).toContain('1 adjusted load will be recorded')
    await checkBodyText('These have been added to your summary log.', 30)

    await HomePage.signOut()
    await expect(browser).toHaveTitle(expect.stringContaining('Signed out'))
  })

  // PAE-1743: an adjusted load excluded for a reason OTHER than missing data must
  // show that reason under the "reduced" heading, not sit bare under a "missing
  // data" one. @openAdjusted above covers the ADDED sub-group end to end; this
  // covers the REDUCED sub-group. The per-code reason strings and the PRN->PERN
  // wording swap are unit-tested (controller.test.js), so one journey through the
  // canonical PRN case is enough here.
  it('should show the reason under the reduced heading for an adjusted PRN-excluded load @adjustedReducedReason @cma', async () => {
    const organisationDetails = await createLinkedOrganisation([
      { material: 'Paper or board (R3)', wasteProcessingType: 'Reprocessor' }
    ])

    const migrationResponse = await updateMigratedOrganisation(
      organisationDetails.refNo,
      [
        {
          reprocessingType: 'input',
          regNumber: 'R25SR500030912PA',
          accNumber: 'ACC123456',
          status: 'approved'
        }
      ]
    )

    await createLinkAndLogin(organisationDetails.refNo, migrationResponse.email)

    // Baseline: row 1001 is included and contributes 339.99t to the balance.
    await DashboardPage.selectLink(1)
    await WasteRecordsPage.submitSummaryLogLink()
    await UploadSummaryLogPage.performUploadAndReturnToHomepage(
      'resources/summary-log.xlsx'
    )

    // Re-upload with row 1001's PRN answer flipped to Yes, excluding it — an
    // open-period adjustment that reverses its earlier contribution.
    await DashboardPage.selectLink(1)
    await WasteRecordsPage.submitSummaryLogLink()
    await UploadSummaryLogPage.uploadFile(
      'resources/reprocessor-input-prn-issued.xlsx'
    )
    await UploadSummaryLogPage.continue()

    await checkBodyText('Your summary log is being checked', 30)
    await checkBodyText('Upload your summary log', 60)
    await checkBodyText('Open periods: adjusted loads', 30)

    await CheckSummaryLogPage.expandAllLoadDetails()

    const detailsText = await CheckSummaryLogPage.loadDetailsText()
    const rows = await CheckSummaryLogPage.loadRowItems()
    const bodyText = await browser.execute(() => document.body.innerText)

    // The balance still moves by the excluded load's 339.99t — the ticket is
    // explicit that the balance was correct and only the reason was hidden, so
    // guard the value, not just the direction.
    expect(bodyText).toContain(
      'The adjusted loads will remove 339.99 tonnes from your waste balance.'
    )
    expect(detailsText).toContain(ADJUSTED_REDUCED_HEADING)
    // The reported defect: pre-fix, row 1001 sat bare under the "missing data"
    // heading. Assert its reason shows and that heading is gone.
    expect(rows).toContain(
      'Row ID: 1001. A PRN was already issued for this load'
    )
    expect(bodyText).not.toContain(MISSING_DATA_HEADING)

    await HomePage.signOut()
    await expect(browser).toHaveTitle(expect.stringContaining('Signed out'))
  })
})
