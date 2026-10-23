import { BaseAPI } from '../../apis/base-api.js'
import { assertSuccessResponse } from '../response-assertions.js'
import { wasteBalancePath } from './natural-key-paths.js'
import { reportingPeriodsOf, yearCalendarPath } from './year-calendar.js'

const SUMMARY_LOG_FAILURE_STATUSES = [
  'invalid',
  'rejected',
  'validation_failed',
  'submission_failed'
]

/**
 * @param {BaseAPI} baseAPI
 * @param {string} summaryLogPath
 * @param {Record<string, string | undefined>} defraAuthHeader
 * @param {string | string[]} targetStatus - the status to wait for, or any one of several
 */
export async function waitForSummaryLogStatus(
  baseAPI,
  summaryLogPath,
  defraAuthHeader,
  targetStatus
) {
  const targets = [targetStatus].flat()
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
    if (targets.includes(status)) {
      return responseData
    }
    if (SUMMARY_LOG_FAILURE_STATUSES.includes(status)) {
      throw new Error(
        `Summary log reached '${status}' while waiting for '${targets.join("' or '")}'`
      )
    }
    // Matches wdio's waitforInterval (wdio.github.conf.js) so this polls no
    // coarser than the UI's own checkBodyText waits.
    await new Promise((resolve) => setTimeout(resolve, 200))
  }

  throw new Error(
    `Timed out waiting for summary log status '${targets.join("' or '")}' (last seen: '${status}')`
  )
}

/**
 * One accreditation's balance, as the route sends it: decimals as strings.
 *
 * @typedef {Object} WasteBalance
 * @property {string} amount
 * @property {string} availableAmount - what a note can draw on
 * @property {string} [nonDecemberAvailableAmount] - what of that is outside the December portion, when the service marks one
 */

/**
 * Polls the accreditation's waste balance until `until` accepts it. The
 * balance is computed asynchronously by the same worker that validates and
 * submits the summary log, so it can lag slightly behind 'submitted'.
 *
 * @param {string} refNo
 * @param {string} accreditationId
 * @param {Record<string, string | undefined>} defraAuthHeader
 * @param {(balance: WasteBalance) => boolean} until
 * @param {string} waitingFor - what the timeout says it waited for
 * @param {number} timeoutMs
 * @returns {Promise<WasteBalance>}
 */
async function pollWasteBalance(
  refNo,
  accreditationId,
  defraAuthHeader,
  until,
  waitingFor,
  timeoutMs
) {
  const baseAPI = new BaseAPI()
  const path = await wasteBalancePath(refNo, accreditationId)
  const startTime = Date.now()
  /** @type {WasteBalance | undefined} */
  let lastSeen

  while (Date.now() - startTime < timeoutMs) {
    const response = await baseAPI.get(path, defraAuthHeader)
    /** @type {WasteBalance} */
    const balance = await assertSuccessResponse(response, `GET ${path}`)
    if (until(balance)) {
      return balance
    }
    lastSeen = balance
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  throw new Error(
    `Timed out waiting for ${waitingFor} at ${path} (last seen: ${JSON.stringify(lastSeen)})`
  )
}

/**
 * Polls the accreditation's waste balance until the route serves one.
 *
 * @param {string} refNo
 * @param {string} accreditationId
 * @param {Record<string, string | undefined>} defraAuthHeader
 * @param {number} [timeoutMs]
 * @returns {Promise<WasteBalance>}
 */
export function waitForWasteBalance(
  refNo,
  accreditationId,
  defraAuthHeader,
  timeoutMs = 30000
) {
  return pollWasteBalance(
    refNo,
    accreditationId,
    defraAuthHeader,
    Boolean,
    'a waste balance',
    timeoutMs
  )
}

/**
 * Whether a general note of `tonnage` could draw on the balance: the available
 * amount outside any December portion, which only a December note can draw on.
 *
 * @param {WasteBalance} balance
 * @param {number} tonnage
 */
export function fundsGeneralNote(balance, tonnage) {
  return (
    Number(balance.nonDecemberAvailableAmount ?? balance.availableAmount) >=
    tonnage
  )
}

/**
 * Polls the waste balance until a general note of `tonnage` could draw on it.
 * The service refuses a draft over what it holds, so a note planned against a
 * submitted log has to wait for the balance to catch up.
 *
 * @param {string} refNo
 * @param {string} accreditationId
 * @param {Record<string, string | undefined>} defraAuthHeader
 * @param {number} tonnage
 * @param {number} [timeoutMs]
 */
export async function waitForAvailableBalance(
  refNo,
  accreditationId,
  defraAuthHeader,
  tonnage,
  timeoutMs = 30000
) {
  await pollWasteBalance(
    refNo,
    accreditationId,
    defraAuthHeader,
    (balance) => fundsGeneralNote(balance, tonnage),
    `the ${tonnage} t the plan drafted a note against`,
    timeoutMs
  )
}

// Polls the year's reports calendar until some reporting period carries the given
// periodStatus. The resubmission flag is written by the backend's summary-log
// submit worker, so it can land shortly after the log reaches 'submitted'.
export async function waitForReportingPeriodStatus(
  keys,
  defraAuthHeader,
  periodStatus
) {
  const baseAPI = new BaseAPI()
  const calendarPath = yearCalendarPath(keys)
  const timeoutMs = 30000
  const startTime = Date.now()
  let lastSeen = []

  while (Date.now() - startTime < timeoutMs) {
    const response = await baseAPI.get(calendarPath, defraAuthHeader)
    const reportingPeriods = reportingPeriodsOf(
      await assertSuccessResponse(response, `GET ${calendarPath}`)
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
