import { BaseAPI } from '../../apis/base-api.js'
import { assertSuccessResponse } from '../response-assertions.js'

const SUMMARY_LOG_FAILURE_STATUSES = [
  'invalid',
  'rejected',
  'validation_failed',
  'submission_failed'
]

export async function waitForSummaryLogStatus(
  baseAPI,
  summaryLogPath,
  defraAuthHeader,
  targetStatus
) {
  const timeoutMs = 90000
  const startTime = Date.now()
  let status
  let responseData

  while (Date.now() - startTime < timeoutMs) {
    const response = await baseAPI.get(summaryLogPath, defraAuthHeader)
    responseData = await assertSuccessResponse(
      response,
      `GET ${summaryLogPath}`
    )
    ;({ status } = responseData)
    if (status === targetStatus) {
      return responseData
    }
    if (SUMMARY_LOG_FAILURE_STATUSES.includes(status)) {
      throw new Error(
        `Summary log reached '${status}' while waiting for '${targetStatus}'`
      )
    }
    // Matches wdio's waitforInterval (wdio.github.conf.js) so this polls no
    // coarser than the UI's own checkBodyText waits.
    await new Promise((resolve) => setTimeout(resolve, 200))
  }

  throw new Error(
    `Timed out waiting for summary log status '${targetStatus}' (last seen: '${status}')`
  )
}

// Polls the waste-balances endpoint until it returns a non-empty body - the
// balance is computed asynchronously by the same worker that validates/
// submits the summary log, so it can lag slightly behind 'submitted'.
export async function waitForWasteBalance(
  orgId,
  accreditationId,
  defraAuthHeader,
  timeoutMs = 30000
) {
  const baseAPI = new BaseAPI()
  const path = `/v1/organisations/${orgId}/waste-balances?accreditationIds=${accreditationId}`
  const startTime = Date.now()

  while (Date.now() - startTime < timeoutMs) {
    const response = await baseAPI.get(path, defraAuthHeader)
    const body = await assertSuccessResponse(response, `GET ${path}`)
    if (Object.keys(body).length > 0) {
      return body
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  throw new Error(`Timed out waiting for a waste balance at ${path}`)
}

// Polls the reports calendar until some reporting period carries the given
// periodStatus. The resubmission flag is written by the backend's summary-log
// submit worker, so it can land shortly after the log reaches 'submitted'.
export async function waitForReportingPeriodStatus(
  refNo,
  registrationId,
  defraAuthHeader,
  periodStatus
) {
  const baseAPI = new BaseAPI()
  const calendarPath = `/v1/organisations/${refNo}/registrations/${registrationId}/reports/calendar`
  const timeoutMs = 30000
  const startTime = Date.now()
  let lastSeen = []

  while (Date.now() - startTime < timeoutMs) {
    const response = await baseAPI.get(calendarPath, defraAuthHeader)
    const { reportingPeriods } = await assertSuccessResponse(
      response,
      `GET ${calendarPath}`
    )
    if (reportingPeriods.some((rp) => rp.periodStatus === periodStatus)) {
      return
    }
    lastSeen = reportingPeriods.map(
      (rp) =>
        `${rp.year}/${rp.period}#${rp.submissionNumber}:${rp.periodStatus}`
    )
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  throw new Error(
    `Timed out waiting for a reporting period with status '${periodStatus}' (last seen: ${lastSeen.join(', ')})`
  )
}
