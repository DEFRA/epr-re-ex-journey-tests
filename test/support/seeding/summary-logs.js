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
  const uploaded = await uploadSummaryLog(
    refNo,
    registrationId,
    defraAuthHeader,
    filePath,
    baseAPI
  )

  await waitForSummaryLogStatus(
    baseAPI,
    uploaded.summaryLogPath,
    defraAuthHeader,
    'validated'
  )

  return uploaded
}

/**
 * Initiate (backend) → multipart file POST (cdp-uploader), stopping before the
 * outcome. A workbook the service rejects never reaches 'validated', so a
 * caller wanting one waits for the status it expects itself.
 *
 * @param {string} refNo
 * @param {string} registrationId
 * @param {Record<string, string | undefined>} defraAuthHeader
 * @param {string} filePath
 * @param {BaseAPI} [baseAPI]
 * @returns {Promise<{ summaryLogId: string, summaryLogPath: string, baseAPI: BaseAPI }>}
 */
export async function uploadSummaryLog(
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

  return {
    summaryLogId,
    summaryLogPath: `${summaryLogsPath}/${summaryLogId}`,
    baseAPI
  }
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

  await submitSummaryLog(summaryLogPath, defraAuthHeader, baseAPI)

  return summaryLogId
}

/**
 * The validation a summary log's read returns: fatal issues as `failures`,
 * row issues under the table and row they sit on.
 *
 * @typedef {Object} ReportedValidation
 * @property {{code: string}[]} [failures]
 * @property {Record<string, {rows: {issues: {type: string, code: string}[]}[]}>} [concerns]
 */

/**
 * What submitting content needs of an API: a post answering with a status
 * and a body readable as JSON or as text.
 *
 * @typedef {{post: (endpoint: string, data: string, headers: Record<string, string | undefined>) => Promise<{statusCode: number, body: {json: () => Promise<unknown>, text: () => Promise<string>}}>}} ContentPoster
 */

/**
 * @typedef {Object} SummaryLogAnswer - the document the dev route answers with
 * @property {string} summaryLogId
 * @property {'submitted' | 'invalid'} status
 * @property {ReportedValidation} [validation]
 */

/**
 * Submits a summary log from its content in one request through the dev
 * route, which validates it and submits what validates. Answers with the
 * document the route answered with: submitted, or invalid with its issues.
 * Anything else, a conflict with another submission or a payload the route
 * would not read, stops the caller.
 *
 * @param {string} refNo
 * @param {string} registrationId
 * @param {Record<string, string | undefined>} defraAuthHeader
 * @param {import('../spreadsheet/summarylogs-content-generator.js').SummaryLogContent} content
 * @param {ContentPoster} [baseAPI]
 * @returns {Promise<SummaryLogAnswer>}
 */
export async function submitSummaryLogContent(
  refNo,
  registrationId,
  defraAuthHeader,
  content,
  baseAPI = new BaseAPI()
) {
  const path = `/v1/dev/organisations/${refNo}/registrations/${registrationId}/summary-logs`
  const response = await baseAPI.post(path, JSON.stringify(content), {
    ...defraAuthHeader,
    'content-type': 'application/json'
  })
  if (response.statusCode !== 200 && response.statusCode !== 422) {
    // Read as text, not JSON: a gateway error or an HTML error page would
    // throw on parse and take the status code down with it.
    throw new Error(
      `POST ${path}: expected the submitted or invalid document but got ${response.statusCode}\n${await response.body.text()}`
    )
  }
  const body = await response.body.json()
  if (!isSummaryLogAnswer(body)) {
    throw new Error(
      `POST ${path}: answered ${response.statusCode} with neither the submitted nor the invalid document\n${JSON.stringify(body, null, 2)}`
    )
  }
  return body
}

/**
 * @param {unknown} body
 * @returns {body is SummaryLogAnswer}
 */
function isSummaryLogAnswer(body) {
  return (
    typeof body === 'object' &&
    body !== null &&
    'summaryLogId' in body &&
    typeof body.summaryLogId === 'string' &&
    'status' in body &&
    (body.status === 'submitted' || body.status === 'invalid')
  )
}

/**
 * Submits a validated summary log and waits for the submission worker to land
 * it.
 *
 * @param {string} summaryLogPath
 * @param {Record<string, string | undefined>} defraAuthHeader
 * @param {BaseAPI} [baseAPI]
 */
export async function submitSummaryLog(
  summaryLogPath,
  defraAuthHeader,
  baseAPI = new BaseAPI()
) {
  const submitResponse = await baseAPI.post(
    `${summaryLogPath}/submit`,
    '',
    defraAuthHeader
  )
  await assertSuccessResponse(submitResponse, `POST ${summaryLogPath}/submit`)

  return waitForSummaryLogStatus(
    baseAPI,
    summaryLogPath,
    defraAuthHeader,
    'submitted'
  )
}
