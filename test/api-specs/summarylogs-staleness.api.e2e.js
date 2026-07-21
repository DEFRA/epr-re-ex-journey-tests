import { expect } from 'chai'
import { readFile } from 'node:fs/promises'
import { BaseAPI } from '../apis/base-api.js'
import { defraIdStub } from '../support/defra-id-stub.js'
import {
  createAndRegisterDefraIdUser,
  createLinkedOrganisation,
  linkDefraIdUser,
  updateMigratedOrganisation,
  waitForSummaryLogStatus
} from '../support/apicalls.js'

const FIXTURE_PATH = 'resources/summary-log.xlsx'

// Mirrors apicalls.js's uploadAndSubmitSummaryLog, but stops after reaching
// 'validated' rather than also submitting - the staleness scenario needs two
// summary logs both sitting at 'validated' before either is submitted.
async function uploadAndValidate(baseAPI, refNo, registrationId, authHeader) {
  const summaryLogsPath = `/v1/organisations/${refNo}/registrations/${registrationId}/summary-logs`
  const initiateResponse = await baseAPI.post(
    summaryLogsPath,
    JSON.stringify({ redirectUrl: '/' }),
    { ...authHeader, 'content-type': 'application/json' }
  )
  expect(initiateResponse.statusCode).to.equal(201)
  const { summaryLogId, uploadUrl } = await initiateResponse.body.json()

  const hostUploadUrl = new URL(
    new URL(uploadUrl).pathname,
    'http://localhost:7337'
  )
  const form = new FormData()
  form.append(
    'summaryLogUpload',
    new Blob([new Uint8Array(await readFile(FIXTURE_PATH))], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    }),
    'summary-log.xlsx'
  )
  const uploadResponse = await fetch(hostUploadUrl, {
    method: 'POST',
    body: form,
    redirect: 'manual'
  })
  expect(uploadResponse.status).to.be.lessThan(400)

  const summaryLogPath = `${summaryLogsPath}/${summaryLogId}`
  await waitForSummaryLogStatus(
    baseAPI,
    summaryLogPath,
    authHeader,
    'validated'
  )

  return { summaryLogId, summaryLogPath }
}

describe('Summary log staleness detection @summaryLogStaleness', () => {
  const baseAPI = new BaseAPI()

  it('rejects a stale preview at submission time, marking it superseded @summaryLogStalePreviewRejected', async () => {
    const org = await createLinkedOrganisation([
      { wasteProcessingType: 'Reprocessor' }
    ])
    const migrated = await updateMigratedOrganisation(org.refNo, [
      {
        reprocessingType: 'input',
        regNumber: 'R25SR500030912PA',
        accNumber: 'ACC123456',
        status: 'approved'
      }
    ])
    const user = await createAndRegisterDefraIdUser(migrated.email)
    await linkDefraIdUser(org.refNo, user.userId, migrated.email)
    const authHeader = defraIdStub.authHeader(user.userId)
    const registrationId = migrated.registrationIds[0]

    const first = await uploadAndValidate(
      baseAPI,
      org.refNo,
      registrationId,
      authHeader
    )
    const second = await uploadAndValidate(
      baseAPI,
      org.refNo,
      registrationId,
      authHeader
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
    const body = await secondSubmitResponse.body.json()
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
