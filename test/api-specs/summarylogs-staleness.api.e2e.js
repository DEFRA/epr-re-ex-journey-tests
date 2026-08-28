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
  updateMigratedOrganisation
} from '../support/seeding/organisation.js'
import { uploadAndValidateSummaryLog } from '../support/seeding/summary-logs.js'
import { waitForSummaryLogStatus } from '../support/seeding/waiters.js'
const FIXTURE_PATH = 'resources/summary-log.xlsx'

test.describe('Summary log staleness detection @summaryLogStaleness', () => {
  const baseAPI = new BaseAPI()

  test('rejects a stale preview at submission time, marking it superseded @summaryLogStalePreviewRejected', async () => {
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

    const first = await uploadAndValidateSummaryLog(
      org.refNo,
      registrationId,
      authHeader,
      FIXTURE_PATH,
      baseAPI
    )
    const second = await uploadAndValidateSummaryLog(
      org.refNo,
      registrationId,
      authHeader,
      FIXTURE_PATH,
      baseAPI
    )

    const firstSubmitResponse = await baseAPI.post(
      `${first.summaryLogPath}/submit`,
      '',
      authHeader
    )
    expect(firstSubmitResponse.statusCode).to.equal(200)
    await waitForSummaryLogStatus(
      baseAPI,
      first.summaryLogPath,
      authHeader,
      'submitted'
    )

    const secondSubmitResponse = await baseAPI.post(
      `${second.summaryLogPath}/submit`,
      '',
      authHeader
    )
    expect(secondSubmitResponse.statusCode).to.equal(409)
    const body = /** @type {any} */ (await secondSubmitResponse.body.json())
    expect(body.message).to.equal(
      'Waste records have changed since preview was generated. Please re-upload.'
    )

    await waitForSummaryLogStatus(
      baseAPI,
      second.summaryLogPath,
      authHeader,
      'superseded'
    )
  })
})
