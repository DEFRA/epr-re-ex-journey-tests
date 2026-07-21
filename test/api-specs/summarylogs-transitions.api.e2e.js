import { expect } from 'chai'
import { randomUUID } from 'crypto'
import { BaseAPI } from '../apis/base-api.js'
import { SummaryLog } from '../support/generator.js'
import {
  createLinkedOrganisation,
  updateMigratedOrganisation
} from '../support/apicalls.js'

// upload-completed returns 202 (accepted for async processing). When the new
// status is 'validating' (fileStatus 'complete'), the backend also kicks off
// a real async validation worker against the given organisationId/
// registrationId/s3Key - since no real file exists at that key, the worker
// genuinely (and correctly) transitions the record on to 'invalid' shortly
// after, its own defined failure status (SUMMARY_LOG_STATUS.INVALID), not a
// bug. That makes 'validating' an inherently transient state once a worker
// run happens to land between our two calls - a genuine race, not something
// a fixed delay (in either direction) can reliably avoid. Only scenarios
// whose "from" state is 'complete' (i.e. 'validating') are exposed to this;
// attemptFromComplete below re-attempts with a fresh summary log if the race
// is lost, rather than accepting it as flaky.
async function submitUploadCompleted(baseAPI, summaryLog, fileStatus) {
  summaryLog.setFileData(
    summaryLog.s3Bucket,
    summaryLog.s3Key,
    summaryLog.fileId,
    summaryLog.filename,
    fileStatus
  )
  const path = `/v1/organisations/${summaryLog.orgId}/registrations/${summaryLog.regId}/summary-logs/${summaryLog.summaryLogId}/upload-completed`
  return baseAPI.post(
    path,
    JSON.stringify(summaryLog.toUploadCompletedPayload())
  )
}

describe('Summary log upload-completed state transitions @summaryLogTransitions', () => {
  const baseAPI = new BaseAPI()
  let orgId
  let registrationId

  before(async () => {
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
    orgId = org.orgId
    registrationId = migrated.registrationIds[0]
  })

  function newSummaryLog(fileStatus) {
    const summaryLog = new SummaryLog(orgId, registrationId)
    summaryLog.setUploadData({
      s3Bucket: 're-ex-summary-logs',
      s3Key: `test-upload-key-${randomUUID()}`,
      fileId: randomUUID(),
      filename: 'test-upload.xlsx',
      fileStatus
    })
    return summaryLog
  }

  // Retries the from-'complete' transition attempts against a fresh summary
  // log when the async validation worker wins the race first (observed as
  // the second response's message citing 'invalid' rather than 'validating'
  // as the from-state) - a genuine race per the comment above, not a bug to
  // paper over indefinitely, so capped at a small number of attempts.
  async function attemptFromComplete(to, attempts = 10) {
    for (let attempt = 1; attempt <= attempts; attempt++) {
      const summaryLog = newSummaryLog('complete')
      const firstResponse = await submitUploadCompleted(
        baseAPI,
        summaryLog,
        'complete'
      )
      expect(firstResponse.statusCode).to.equal(202)

      const secondResponse = await submitUploadCompleted(
        baseAPI,
        summaryLog,
        to
      )
      const body = await secondResponse.body.json()

      if (
        secondResponse.statusCode === 409 &&
        body.message?.startsWith(
          'Cannot transition summary log from validating'
        )
      ) {
        return { response: secondResponse, body }
      }

      if (attempt === attempts) {
        return { response: secondResponse, body }
      }
    }
    return undefined
  }

  const validTransitions = ['pending', 'complete', 'rejected']

  for (const toStatus of validTransitions) {
    it(`allows a valid transition from pending to ${toStatus} @summaryLogValidTransition${toStatus}`, async () => {
      const summaryLog = newSummaryLog('pending')

      const firstResponse = await submitUploadCompleted(
        baseAPI,
        summaryLog,
        'pending'
      )
      expect(firstResponse.statusCode).to.equal(202)

      const secondResponse = await submitUploadCompleted(
        baseAPI,
        summaryLog,
        toStatus
      )
      expect(secondResponse.statusCode).to.equal(202)
    })
  }

  const invalidTransitions = [
    {
      from: 'complete',
      to: 'rejected',
      fromLog: 'validating',
      toLog: 'rejected'
    },
    {
      from: 'complete',
      to: 'pending',
      fromLog: 'validating',
      toLog: 'preprocessing'
    },
    {
      from: 'rejected',
      to: 'complete',
      fromLog: 'rejected',
      toLog: 'validating'
    },
    {
      from: 'rejected',
      to: 'pending',
      fromLog: 'rejected',
      toLog: 'preprocessing'
    },
    {
      from: 'rejected',
      to: 'rejected',
      fromLog: 'rejected',
      toLog: 'rejected'
    },
    {
      from: 'complete',
      to: 'complete',
      fromLog: 'validating',
      toLog: 'validating'
    }
  ]

  for (const { from, to, fromLog, toLog } of invalidTransitions) {
    it(`rejects an invalid transition from ${from} to ${to} @summaryLogInvalidTransition${from}To${to}`, async () => {
      if (from === 'complete') {
        const { response, body } = await attemptFromComplete(to)
        expect(body.message).to.equal(
          `Cannot transition summary log from ${fromLog} to ${toLog}`
        )
        expect(response.statusCode).to.equal(409)
        return
      }

      const summaryLog = newSummaryLog(from)

      const firstResponse = await submitUploadCompleted(
        baseAPI,
        summaryLog,
        from
      )
      expect(firstResponse.statusCode).to.equal(202)

      const secondResponse = await submitUploadCompleted(
        baseAPI,
        summaryLog,
        to
      )
      expect(secondResponse.statusCode).to.equal(409)
      const body = await secondResponse.body.json()
      expect(body.message).to.equal(
        `Cannot transition summary log from ${fromLog} to ${toLog}`
      )
    })
  }
})
