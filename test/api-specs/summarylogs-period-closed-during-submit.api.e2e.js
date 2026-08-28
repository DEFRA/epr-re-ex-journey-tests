import { test } from '@playwright/test'
import { expect } from 'chai'
import { BaseAPI } from '../apis/base-api.js'
import { defraIdStub } from '../support/defra-id-stub.js'
import {
  createAndRegisterDefraIdUser,
  linkDefraIdUser
} from '../support/defra-id-linking.js'
import {
  createLinkedOrganisation,
  updateMigratedOrganisation,
  uploadAndValidateSummaryLog
} from '../support/organisation-seeding.js'
import { waitForSummaryLogStatus } from '../support/seeding-waiters.js'
const FIXTURE_PATH = 'resources/summary-log.xlsx'
const YEAR = 2026
const CADENCE = 'monthly'
const PERIOD = 1
const SUBMISSION_NUMBER = 1

// PAE-1686: the open/closed period classification a summary log validates
// against is computed at validate time. If a periodic report for the same
// registration is submitted in the gap between validate and submit, the
// async submit worker's guard must block the submission (submission_failed)
// rather than silently overwrite the now-closed period.
//
// NOT covered here: "no waste records exist in the database for the summary
// log registration" - the source Cucumber suite asserts this via a direct
// MongoDB query, which this API test layer has no client wired up for (only
// HTTP, matching every other file in test/api-specs/). Everything reachable
// via the HTTP API is covered; the DB-level assertion would need a Mongo
// client added to this layer first.
test.describe('Summary log submit blocked by period-closed-during-submit guard @summaryLogPeriodClosedDuringSubmit', () => {
  const baseAPI = new BaseAPI()

  test('blocks submission when a report closes the period after validation @summaryLogPeriodClosedGuard', async () => {
    const org = await createLinkedOrganisation([
      { wasteProcessingType: 'Reprocessor' }
    ])
    const migrated = await updateMigratedOrganisation(org.refNo, [
      {
        reprocessingType: 'input',
        regNumber: 'R26ER5000000003PA',
        accNumber: 'A26ER5000000002PA',
        status: 'approved'
      }
    ])
    const user = await createAndRegisterDefraIdUser(migrated.email)
    await linkDefraIdUser(org.refNo, user.userId, migrated.email)
    const authHeader = defraIdStub.authHeader(user.userId)
    const registrationId = migrated.registrationIds[0]

    // Validate the summary log first - its createdAt is the reference the guard keys on.
    const { summaryLogPath } = await uploadAndValidateSummaryLog(
      org.refNo,
      registrationId,
      authHeader,
      FIXTURE_PATH,
      baseAPI
    )

    // The gap: submit a periodic report for the same registration, closing
    // the period after the summary log's createdAt was stamped.
    const reportPath = `/v1/organisations/${org.refNo}/registrations/${registrationId}/reports/${YEAR}/${CADENCE}/${PERIOD}/submissions/${SUBMISSION_NUMBER}`
    const createReportResponse = await baseAPI.post(reportPath, '', authHeader)
    expect(createReportResponse.statusCode).to.equal(201)

    const patchResponse = await baseAPI.patch(
      reportPath,
      JSON.stringify({
        tonnageRecycled: 100.5,
        tonnageNotRecycled: 20,
        prnRevenue: 123.4,
        freeTonnage: 0
      }),
      authHeader
    )
    expect(patchResponse.statusCode).to.equal(200)

    const readyResponse = await baseAPI.post(
      `${reportPath}/status`,
      JSON.stringify({ status: 'ready_to_submit', version: 2 }),
      authHeader
    )
    expect(readyResponse.statusCode).to.equal(200)

    const submittedResponse = await baseAPI.post(
      `${reportPath}/status`,
      JSON.stringify({
        status: 'submitted',
        version: 3,
        submissionDeclaredBy: 'Test User'
      }),
      authHeader
    )
    expect(submittedResponse.statusCode).to.equal(200)

    // The submit POST is accepted (200); the async worker's guard then
    // rejects it, moving the summary log on to 'submission_failed'.
    const submitLogResponse = await baseAPI.post(
      `${summaryLogPath}/submit`,
      '',
      authHeader
    )
    expect(submitLogResponse.statusCode).to.equal(200)

    await waitForSummaryLogStatus(
      baseAPI,
      summaryLogPath,
      authHeader,
      'submission_failed'
    )
  })
})
