import { randomUUID } from 'crypto'
import ExcelJS from 'exceljs'
import { mkdir, readFile } from 'node:fs/promises'
import { basename, dirname } from 'node:path'
import { BaseAPI } from '../../apis/base-api.js'
import config from '../../config/config.js'
import { assertSuccessResponse } from '../response-assertions.js'
import { waitForSummaryLogStatus } from './waiters.js'

// A fixture opens with its column markers, its headings and the worked example
// the template ships. An operator's own loads start below those.
const FIRST_LOAD_ROW = 4

/**
 * Writes a copy of a summary log fixture with every load re-dated to the given
 * day, and returns the path to the copy.
 *
 * A fixture states its dates outright, so it credits whichever reporting period
 * those dates fell in when someone built it. A journey reading a page that
 * shows one period at a time therefore stops finding the fixture's tonnage once
 * the service moves past that period, and does so on a date nobody chose.
 * Taking the date from the clock instead keeps the loads in the period the
 * service is currently reporting on.
 *
 * The worked example keeps its own date, being the template's rather than the
 * operator's, and the backend reads it as neither.
 *
 * @param {string} fixturePath
 * @param {Date} date
 * @returns {Promise<string>}
 */
export async function summaryLogDatedAt(fixturePath, date) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(fixturePath)

  workbook.eachSheet((sheet) => {
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber < FIRST_LOAD_ROW) {
        return
      }
      row.eachCell((cell) => {
        if (cell.value instanceof Date) {
          cell.value = date
        }
      })
    })
  })

  // data/ is gitignored, so it is absent in a fresh clone or worktree. The name
  // carries a fresh id because journeys re-dating a fixture run alongside each
  // other and would otherwise write over one another's copy.
  const copyPath = `data/${basename(fixturePath, '.xlsx')}-${randomUUID()}.xlsx`
  await mkdir(dirname(copyPath), { recursive: true })
  await workbook.xlsx.writeFile(copyPath)

  return copyPath
}

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
