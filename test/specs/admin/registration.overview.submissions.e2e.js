import { test, expect } from '@playwright/test'

import { AdminLoginPage } from 'page-objects/admin/login.page'
import { OrganisationsPage } from 'page-objects/admin/organisations.page'
import { OrganisationOverviewPage } from 'page-objects/admin/organisation.overview.page'
import { RegistrationOverviewPage } from 'page-objects/admin/registration.overview.page'
import { ReportViewPage } from 'page-objects/admin/report.view.page'
import { UnsubmitConfirmationPage } from 'page-objects/admin/unsubmit.confirmation.page'
import {
  RESTATED_PERIOD,
  seedReportSubmission,
  seedRestatedClosedPeriod
} from '../../support/apicalls.js'

const isQuarterOne2026 = (row) =>
  row.period === 'Quarter 1' && row.due.startsWith('2026')

// .find() with a not-found guard, so assertions on the result type-check.
const findOrThrow = (items, predicate, description) => {
  const item = items.find(predicate)
  if (!item) {
    throw new Error(`Not found: ${description}`)
  }
  return item
}

// The summary-log pipeline (upload, scan, async validation and submission)
// needs longer than the default per-test timeout.
test.describe('Registration overview - multiple submissions per period', () => {
  test.describe.configure({ timeout: 3 * 60 * 1000 })

  test.beforeEach(async ({ page }) => {
    const loginPage = new AdminLoginPage(page)
    await loginPage.loginAsServiceMaintainer()
  })

  test('lists every submission for a period as its own reachable row, with submission numbers on view and unsubmit pages @organisations @multipleSubmissions', async ({
    page
  }) => {
    const organisationsPage = new OrganisationsPage(page)
    const organisationOverviewPage = new OrganisationOverviewPage(page)
    const registrationOverviewPage = new RegistrationOverviewPage(page)
    const reportViewPage = new ReportViewPage(page)
    const unsubmitConfirmationPage = new UnsubmitConfirmationPage(page)

    // A registered-only reprocessor whose Q1 2026 is closed by a submitted
    // report and then restated, so the backend flags it requiring resubmission.
    const { refNo, companyName, registrationId, defraAuthHeader } =
      await seedRestatedClosedPeriod()

    await organisationsPage.open()
    await organisationsPage.searchFor(companyName)
    await organisationsPage.viewLink(1)
    await organisationOverviewPage.viewRegistrationLink(1)

    // The restated period renders two rows: the submitted first submission
    // and a requires_resubmission skeleton with nothing to view yet.
    let reportsData = await registrationOverviewPage.getReportsTableData()
    let quarterOneRows = reportsData.filter(isQuarterOne2026)
    expect(quarterOneRows).toHaveLength(2)

    const submittedRow = findOrThrow(
      quarterOneRows,
      (row) => row.submission === '1',
      'Quarter 1 row for submission 1'
    )
    expect(submittedRow.status).toEqual('submitted')
    expect(submittedRow.links.map((link) => link.text)).toEqual([
      'View',
      'Unsubmit'
    ])

    const skeletonRow = findOrThrow(
      quarterOneRows,
      (row) => row.submission === '',
      'Quarter 1 skeleton row'
    )
    expect(skeletonRow.status).toEqual('requires_resubmission')
    expect(skeletonRow.links).toHaveLength(0)

    // Statuses come from the backend periodStatus: an ended period with no
    // report shows due/overdue (the calendar omits periods still in
    // progress), with nothing to view and no submission number.
    const outstandingRows = reportsData.filter((row) =>
      ['due', 'overdue'].includes(row.status)
    )
    expect(outstandingRows.length).toBeGreaterThanOrEqual(1)
    for (const row of outstandingRows) {
      expect(row.submission).toEqual('')
      expect(row.links).toHaveLength(0)
    }

    // Resubmit via the API: the period now holds two submitted submissions,
    // each with its own row and its own View link.
    await seedReportSubmission(refNo, registrationId, defraAuthHeader, {
      ...RESTATED_PERIOD,
      submissionNumber: 2
    })
    await page.reload()

    reportsData = await registrationOverviewPage.getReportsTableData()
    quarterOneRows = reportsData.filter(isQuarterOne2026)
    // Row order relies on the backend calendar sorting items within a period
    // by submissionNumber ascending (build-all-submission-periods.js), which
    // the frontend renders as-is.
    expect(quarterOneRows.map((row) => row.submission)).toEqual(['1', '2'])
    for (const [index, row] of quarterOneRows.entries()) {
      expect(row.status).toEqual('submitted')
      const viewLink = findOrThrow(
        row.links,
        (link) => link.text === 'View',
        `View link on Quarter 1 row ${index + 1}`
      )
      expect(viewLink.href).toContain(
        `/reports/2026/quarterly/1/submissions/${index + 1}`
      )
    }

    // Submission 1 is now superseded by the later submitted submission 2, so
    // its row offers View only: Unsubmit is hidden on a superseded submission
    // (PAE-1657, admin-frontend #472). Submission 2, the current submission,
    // still offers Unsubmit.
    const supersededRow = findOrThrow(
      quarterOneRows,
      (row) => row.submission === '1',
      'Quarter 1 superseded submission 1 row'
    )
    expect(supersededRow.links.map((link) => link.text)).toEqual(['View'])

    const currentRow = findOrThrow(
      quarterOneRows,
      (row) => row.submission === '2',
      'Quarter 1 current submission 2 row'
    )
    expect(currentRow.links.map((link) => link.text)).toEqual([
      'View',
      'Unsubmit'
    ])

    // Opening a prior submission resolves that submission: the report view
    // heading names it.
    const firstSubmissionRowNumber =
      reportsData.findIndex(
        (row) => isQuarterOne2026(row) && row.submission === '1'
      ) + 1
    await registrationOverviewPage.clickOnViewReportLink(
      firstSubmissionRowNumber
    )
    expect(await reportViewPage.getHeaderText()).toEqual(
      'Report – 2026 quarterly period 1 submission 1'
    )
    await page.goBack()

    // Unsubmit the second submission: the confirm and result pages both name
    // the affected submission.
    const secondSubmissionRowNumber =
      reportsData.findIndex(
        (row) => isQuarterOne2026(row) && row.submission === '2'
      ) + 1
    await registrationOverviewPage.clickOnUnsubmitReportLink(
      secondSubmissionRowNumber
    )
    expect(await unsubmitConfirmationPage.getDetailsText()).toContain(
      'Submission: 2'
    )
    await unsubmitConfirmationPage.confirmUnsubmit()
    expect(await unsubmitConfirmationPage.getSuccessMessage()).toEqual(
      'Report unsubmitted'
    )
    expect(await unsubmitConfirmationPage.getDetailsText()).toContain(
      'Submission: 2'
    )
  })
})
