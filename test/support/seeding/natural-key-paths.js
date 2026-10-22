import { BaseAPI } from '../../apis/base-api.js'
import { AuthClient } from '../auth.js'
import { assertSuccessResponse } from '../response-assertions.js'
import { getOrganisation } from './organisation.js'

/**
 * The backend's natural-key routes address records by number, and an
 * accreditation by the year it is for. Seeding holds database ids, so these
 * read the numbers from the organisation record.
 */

/**
 * @param {string} refNo
 */
export async function organisationPath(refNo) {
  const { orgId } = await getOrganisation(refNo)
  return `/organisations/${orgId}`
}

/**
 * @param {string} refNo
 * @param {string} registrationId
 */
export async function registrationPath(refNo, registrationId) {
  const { orgId, registrations } = await getOrganisation(refNo)
  const { registrationNumber } = registrations.find(
    (/** @type {{ id: string }} */ { id }) => id === registrationId
  )
  return `/organisations/${orgId}/registrations/${encodeURIComponent(registrationNumber)}`
}

/**
 * The year the backend files an accreditation under, read from the
 * organisation as the backend serves it, or `null` when it serves none.
 *
 * @param {number} orgId
 * @param {string} registrationNumber
 * @param {string} accreditationNumber
 * @returns {Promise<string | null>}
 */
async function accreditationYear(
  orgId,
  registrationNumber,
  accreditationNumber
) {
  const authClient = new AuthClient()
  await authClient.authenticate()
  const path = `/organisations/${orgId}`
  const { registrations } = await assertSuccessResponse(
    await new BaseAPI().get(path, authClient.authHeader()),
    `GET ${path}`
  )
  const accreditations = registrations[registrationNumber]?.accreditations ?? {}
  const [year] =
    Object.entries(accreditations).find(
      ([, accreditation]) =>
        accreditation.accreditationNumber === accreditationNumber
    ) ?? []
  return year ?? null
}

/**
 * @param {string} refNo
 * @param {string} registrationId
 * @param {string} accreditationId
 */
export async function accreditationPath(
  refNo,
  registrationId,
  accreditationId
) {
  const { orgId, registrations, accreditations } = await getOrganisation(refNo)
  const { registrationNumber } = registrations.find(
    (/** @type {{ id: string }} */ { id }) => id === registrationId
  )
  const { accreditationNumber } = accreditations.find(
    (/** @type {{ id: string }} */ { id }) => id === accreditationId
  )
  const year = await accreditationYear(
    orgId,
    registrationNumber,
    accreditationNumber
  )
  if (!year) {
    throw new Error(
      `Organisation ${orgId} serves no accreditation ${accreditationNumber} under registration ${registrationNumber}`
    )
  }
  return `/organisations/${orgId}/registrations/${encodeURIComponent(registrationNumber)}/accreditations/${year}`
}

/**
 * Where a summary log upload starts, and its upload-completed callback sits
 * under: the registration's accreditation when it holds a live one, as the id
 * route stamped it, otherwise the registration for the year.
 *
 * @param {string} refNo
 * @param {string} registrationId
 * @param {number} year
 */
export async function summaryLogUploadPath(refNo, registrationId, year) {
  const { registrations, accreditations } = await getOrganisation(refNo)
  const { accreditationId } = registrations.find(
    (/** @type {{ id: string }} */ { id }) => id === registrationId
  )
  const live = accreditations.find(
    (
      /** @type {{ id: string, status: string, accreditationNumber?: string }} */ accreditation
    ) =>
      accreditation.id === accreditationId &&
      (accreditation.status === 'approved' ||
        accreditation.status === 'suspended') &&
      accreditation.accreditationNumber
  )
  return live
    ? `${await accreditationPath(refNo, registrationId, live.id)}/summary-log`
    : `${await registrationPath(refNo, registrationId)}/summary-logs/${year}`
}

/**
 * @param {string} refNo
 * @param {string} registrationId
 * @param {string} summaryLogId
 */
export async function summaryLogByIdPath(refNo, registrationId, summaryLogId) {
  return `${await registrationPath(refNo, registrationId)}/summary-logs/${summaryLogId}`
}

/**
 * A report submission's address: an accredited (monthly) report sits under the
 * accreditation for its year, a registered-only (quarterly) one under the
 * registration.
 *
 * @param {string} refNo
 * @param {string} registrationId
 * @param {{ year: number, cadence: string, period: number, submissionNumber: number }} periodSubmission
 */
export async function reportSubmissionPath(
  refNo,
  registrationId,
  { year, cadence, period, submissionNumber }
) {
  const registration = await registrationPath(refNo, registrationId)
  const reports =
    cadence === 'monthly'
      ? `${registration}/accreditations/${year}/reports/${cadence}`
      : `${registration}/reports/${year}/${cadence}`
  return `${reports}/${period}/submissions/${submissionNumber}`
}
