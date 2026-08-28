import { randomUUID } from 'crypto'
import { readFile } from 'node:fs/promises'
import { BaseAPI } from '../../apis/base-api.js'
import config from '../../config/config.js'
import { assertSuccessResponse } from '../response-assertions.js'
import { waitForSummaryLogStatus } from './waiters.js'

// Initiates a summary log against a real registration, then feeds the
// upload-completed callback a pre-seeded floci S3 object directly (matching
// docker/scripts/floci/init.sh's summary-log fixture keys) rather than
// driving a real cdp-uploader multipart upload. The async validation worker
// reads the real object from S3 at that key, so this reaches genuine
// 'validated'/'invalid' outcomes (with real validation.failures/loads data)
// without needing the CDP uploader network path.
export async function ingestSummaryLogFixture(
  orgId,
  registrationId,
  defraAuthHeader,
  { s3Key, filename, fileId = randomUUID(), fileStatus = 'complete' }
) {
  const baseAPI = new BaseAPI()
  const summaryLogsPath = `/v1/organisations/${orgId}/registrations/${registrationId}/summary-logs`

  const initiateResponse = await baseAPI.post(
    summaryLogsPath,
    JSON.stringify({ redirectUrl: '/' }),
    { ...defraAuthHeader, 'content-type': 'application/json' }
  )
  const { summaryLogId } = await assertSuccessResponse(
    initiateResponse,
    `POST ${summaryLogsPath}`
  )

  const summaryLogPath = `${summaryLogsPath}/${summaryLogId}`
  const uploadCompletedResponse = await baseAPI.post(
    `${summaryLogPath}/upload-completed`,
    JSON.stringify({
      form: {
        summaryLogUpload: {
          fileId,
          filename,
          fileStatus,
          s3Bucket: 're-ex-summary-logs',
          s3Key
        }
      }
    })
  )
  if (uploadCompletedResponse.statusCode !== 202) {
    const body = await uploadCompletedResponse.body.json()
    throw new Error(
      `POST ${summaryLogPath}/upload-completed: expected 202 but got ${uploadCompletedResponse.statusCode}\n${JSON.stringify(body)}`
    )
  }

  return { summaryLogId, summaryLogPath, baseAPI }
}

// Drives a summary log over HTTP without the operator frontend as far as
// 'validated': initiate (backend) → multipart file POST (cdp-uploader) → poll.
export async function uploadAndValidateSummaryLog(
  refNo,
  registrationId,
  defraAuthHeader,
  filePath,
  baseAPI = new BaseAPI()
) {
  const summaryLogsPath = `/v1/organisations/${refNo}/registrations/${registrationId}/summary-logs`

  const initiateResponse = await baseAPI.post(
    summaryLogsPath,
    JSON.stringify({ redirectUrl: '/' }),
    { ...defraAuthHeader, 'content-type': 'application/json' }
  )
  const { summaryLogId, uploadUrl } = await assertSuccessResponse(
    initiateResponse,
    `POST ${summaryLogsPath}`
  )

  // The backend addresses cdp-uploader by its container hostname; the test
  // process reaches the same service on the published host port.
  const hostUploadUrl = new URL(new URL(uploadUrl).pathname, config.uploaderUri)

  // The field name must be summaryLogUpload: cdp-uploader echoes the form
  // shape back to the backend callback, whose schema requires that key.
  const form = new FormData()
  form.append(
    'summaryLogUpload',
    new Blob([new Uint8Array(await readFile(filePath))], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    }),
    'summary-log.xlsx'
  )
  const uploadResponse = await fetch(hostUploadUrl, {
    method: 'POST',
    body: form,
    redirect: 'manual'
  })
  if (uploadResponse.status >= 400) {
    throw new Error(
      `POST ${hostUploadUrl}: expected redirect but got ${uploadResponse.status}`
    )
  }

  const summaryLogPath = `${summaryLogsPath}/${summaryLogId}`
  await waitForSummaryLogStatus(
    baseAPI,
    summaryLogPath,
    defraAuthHeader,
    'validated'
  )

  return { summaryLogId, summaryLogPath, baseAPI }
}

// On submit the backend flags any restated closed periods as requiring
// resubmission, which is what unlocks creating submission 2 for those periods.
export async function uploadAndSubmitSummaryLog(
  refNo,
  registrationId,
  defraAuthHeader,
  filePath
) {
  const { summaryLogId, summaryLogPath, baseAPI } =
    await uploadAndValidateSummaryLog(
      refNo,
      registrationId,
      defraAuthHeader,
      filePath
    )

  const submitResponse = await baseAPI.post(
    `${summaryLogPath}/submit`,
    '',
    defraAuthHeader
  )
  await assertSuccessResponse(submitResponse, `POST ${summaryLogPath}/submit`)

  await waitForSummaryLogStatus(
    baseAPI,
    summaryLogPath,
    defraAuthHeader,
    'submitted'
  )

  return summaryLogId
}
