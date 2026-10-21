import { getOrganisation } from './organisation.js'

/**
 * The registration's address by number, which the backend's report routes use.
 *
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
