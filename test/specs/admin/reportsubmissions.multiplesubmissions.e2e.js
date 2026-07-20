import { expect } from '@wdio/globals'

import LoginPage from 'page-objects/admin/login.page'
import ReportSubmissionsPage from 'page-objects/admin/report.submissions.page'
import { parseCsvRows } from '../../support/csv.js'
import {
  RESTATED_PERIOD,
  seedDraftSubmission,
  seedRestatedClosedPeriod,
  submitSeededDraft
} from '../../support/apicalls.js'

// The admin table renders the same period as 'Quarter 1', so this label is
// specific to the CSV.
const PERIOD_LABEL = 'Q1 2026'

// Distinct per submission, so a row can be tied back to the report it came from.
const SUBMISSION_1_TONNAGE = 10
const SUBMISSION_2_TONNAGE = 20

const SUBMISSION_2 = { ...RESTATED_PERIOD, submissionNumber: 2 }

/**
 * Throws rather than returning the status: a failed download would otherwise
 * surface as an empty row list, failing a row-count assertion and pointing at
 * the wrong cause.
 *
 * Matches on organisation name, not registration number: every org seeded by
 * seedRestatedClosedPeriod shares the fixture's registration number, so that
 * would also match orgs left by previous runs. The faker name's random suffix
 * makes it the only unique discriminator.
 */
async function downloadPeriodRows(companyName) {
  await ReportSubmissionsPage.open()
  const csv = await ReportSubmissionsPage.fetchCsv()

  if (csv.status !== 200) {
    throw new Error(`Report submissions CSV download failed: ${csv.status}`)
  }

  return parseCsvRows(csv.body).filter(
    (row) =>
      row['Organisation name'] === companyName &&
      row['Report Period'] === PERIOD_LABEL
  )
}

// Function (not arrow) so this.timeout is reachable: the summary-log pipeline
// (upload, scan, async validation and submission) needs longer than the
// default per-test minute.
describe('Report submissions CSV - multiple submissions per period', function () {
  this.timeout(3 * 60 * 1000)

  before(async () => {
    await LoginPage.loginAsServiceMaintainer()
  })

  it('exports one row per submitted report, and an in-flight correction neither adds a row nor blanks the submitted figures @reportsubmissions @multipleSubmissions', async () => {
    const { refNo, companyName, registrationId, defraAuthHeader } =
      await seedRestatedClosedPeriod({ tonnageRecycled: SUBMISSION_1_TONNAGE })

    const afterFirstSubmission = await downloadPeriodRows(companyName)
    expect(afterFirstSubmission).toHaveLength(1)
    expect(afterFirstSubmission[0]['Submission Number']).toEqual('1')
    expect(afterFirstSubmission[0]['Tonnage recycled']).toEqual(
      String(SUBMISSION_1_TONNAGE)
    )
    // Only asserted non-empty: this is the authenticated user's name, so a
    // literal would pin the auth stub's fixture identity.
    expect(afterFirstSubmission[0]['Submitted By']).not.toEqual('')

    const submittedDate = afterFirstSubmission[0]['Submitted Date']
    expect(submittedDate).not.toEqual('')

    const version = await seedDraftSubmission(
      refNo,
      registrationId,
      defraAuthHeader,
      SUBMISSION_2,
      { tonnageRecycled: SUBMISSION_2_TONNAGE, tonnageNotRecycled: 0 }
    )

    const whileDraftInFlight = await downloadPeriodRows(companyName)
    expect(whileDraftInFlight).toHaveLength(1)
    expect(whileDraftInFlight[0]['Submission Number']).toEqual('1')
    expect(whileDraftInFlight[0]['Tonnage recycled']).toEqual(
      String(SUBMISSION_1_TONNAGE)
    )
    expect(whileDraftInFlight[0]['Submitted Date']).toEqual(submittedDate)

    await submitSeededDraft(
      refNo,
      registrationId,
      defraAuthHeader,
      SUBMISSION_2,
      version
    )

    const afterResubmission = await downloadPeriodRows(companyName)
    expect(afterResubmission).toHaveLength(2)
    expect(afterResubmission.map((row) => row['Submission Number'])).toEqual([
      '1',
      '2'
    ])
    expect(afterResubmission.map((row) => row['Tonnage recycled'])).toEqual([
      String(SUBMISSION_1_TONNAGE),
      String(SUBMISSION_2_TONNAGE)
    ])
    // Each row carries its own submission's details, not the period's latest.
    for (const row of afterResubmission) {
      expect(row['Submitted By']).not.toEqual('')
      expect(row['Submitted Date']).not.toEqual('')
    }
  })
})
