import { BaseAPI } from '../../apis/base-api.js'
import { AuthClient } from '../auth.js'
import { defraIdStub } from '../defra-id-stub.js'
import { generateRegNumber } from '../reg-acc-number.js'
import {
  assertSuccessResponse,
  assertSuccessResponseWithoutBody
} from '../response-assertions.js'
import {
  getDefraUserToken,
  registerAndLinkDefraIdUser
} from '../defra-id-linking.js'
import { waitForReportingPeriodStatus } from './waiters.js'
import {
  createLinkedOrganisation,
  getOrganisation,
  lastCompletedPeriod,
  updateMigratedOrganisation
} from './organisation.js'
import { uploadAndSubmitSummaryLog } from './summary-logs.js'

export async function unsubmitReport(
  organisationId,
  registrationId,
  year,
  cadence,
  period,
  submissionNumber
) {
  const authClient = new AuthClient()
  const baseAPI = new BaseAPI()
  await authClient.authenticate()
  const unsubmitEndpoint = `/v1/organisations/${organisationId}/registrations/${registrationId}/reports/${year}/${cadence}/${period}/submissions/${submissionNumber}/unsubmit`
  const response = await baseAPI.post(
    unsubmitEndpoint,
    '',
    authClient.authHeader()
  )

  await assertSuccessResponseWithoutBody(response, `POST ${unsubmitEndpoint}`)
}

/**
 * Submits a report for a period so that period counts as "closed" — the
 * precondition for closed-month-adjustment detection in the check page.
 *
 * Drives the same create -> patch -> ready_to_submit -> submitted state machine
 * as the backend tests. Optimistic-concurrency version increments on every write,
 * so the write count is fixed (see the inline `version 2/3` notes).
 *
 * patchFields must satisfy the operator's completeness check (assertReportComplete
 * gates submit) — e.g. { tonnageRecycled, tonnageNotRecycled } for registered-only.
 *
 * Auth: report endpoints need the linked Defra ID user's bearer token
 * (defraIdStub.authHeader), NOT the service AuthClient (which 403s) — so a
 * prior Defra ID sign-in flow must have called defraIdStub.generateToken for
 * this userId first.
 */
export async function seedSubmittedReport(
  organisationId,
  registrationId,
  userId,
  year,
  cadence,
  period,
  submissionNumber,
  patchFields
) {
  const baseAPI = new BaseAPI()
  const authHeader = defraIdStub.authHeader(userId)

  const reportPath = `/v1/organisations/${organisationId}/registrations/${registrationId}/reports/${year}/${cadence}/${period}/submissions/${submissionNumber}`
  const statusPath = `${reportPath}/status`

  const createResponse = await baseAPI.post(reportPath, '', authHeader)
  await assertSuccessResponse(createResponse, `POST ${reportPath} (create)`)

  const patchResponse = await baseAPI.patch(
    reportPath,
    JSON.stringify(patchFields),
    authHeader
  )
  await assertSuccessResponse(patchResponse, `PATCH ${reportPath}`)

  // version 2: the report is at v2 after create (v1) + patch (v2)
  const readyResponse = await baseAPI.post(
    statusPath,
    JSON.stringify({ status: 'ready_to_submit', version: 2 }),
    authHeader
  )
  await assertSuccessResponse(
    readyResponse,
    `POST ${statusPath} (ready_to_submit)`
  )

  // version 3: ready_to_submit produced v3
  const submitResponse = await baseAPI.post(
    statusPath,
    JSON.stringify({
      status: 'submitted',
      version: 3,
      submissionDeclaredBy: 'Test User'
    }),
    authHeader
  )
  await assertSuccessResponse(submitResponse, `POST ${statusPath} (submitted)`)
}

// Creates and submits a report for a registration, transitioning it through
// in_progress → ready_to_submit → submitted.
// Cadence is determined by matching the CSV generator's logic: monthly only
// when the linked accreditation is approved/suspended with an accreditationNumber.
// validFrom is set to the period start so the CSV generates exactly one row for
// this registration regardless of when the test runs.
export async function createSubmittedReport(refNo, registrationIndex = 0) {
  const baseAPI = new BaseAPI()
  const authClient = new AuthClient()
  await authClient.authenticate()
  const entraAuthHeader = authClient.authHeader()

  const orgResponse = await baseAPI.get(
    `/v1/organisations/${refNo}`,
    entraAuthHeader
  )
  const orgData = await assertSuccessResponse(
    orgResponse,
    `/v1/organisations/${refNo}`
  )

  const registration = orgData.registrations[registrationIndex]
  const registrationId = registration.id

  const linkedAccreditation = registration.accreditationId
    ? orgData.accreditations.find(
        (a) =>
          a.id === registration.accreditationId &&
          (a.status === 'approved' || a.status === 'suspended') &&
          a.accreditationNumber
      )
    : null
  const cadence = linkedAccreditation ? 'monthly' : 'quarterly'
  const { year, period } = lastCompletedPeriod(cadence)

  const periodStartMonth = cadence === 'monthly' ? period : (period - 1) * 3 + 1
  orgData.registrations[registrationIndex].validFrom =
    `${year}-${String(periodStartMonth).padStart(2, '0')}-01`

  // When the accreditation isn't approved the CSV generator treats this as quarterly,
  // but the backend uses accreditationId presence to enforce monthly cadence.
  // Delete the key (not null) so JSON omits it — schema only allows absent, not explicit null.
  if (!linkedAccreditation) {
    delete orgData.registrations[registrationIndex].accreditationId
  }

  const email = orgData.submitterContactDetails.email

  const payload = {
    version: Number(orgData.version),
    updateFragment: orgData
  }
  const updateResponse = await baseAPI.put(
    `/v1/organisations/${refNo}`,
    JSON.stringify(payload),
    entraAuthHeader
  )

  await assertSuccessResponse(updateResponse, `PUT /v1/organisations/${refNo}`)

  const defraToken = await getDefraUserToken(email)
  const defraAuthHeader = { Authorization: `Bearer ${defraToken}` }
  const jsonHeaders = { ...defraAuthHeader, 'content-type': 'application/json' }

  const linkResponse = await baseAPI.post(
    `/v1/organisations/${refNo}/link`,
    '',
    defraAuthHeader
  )

  await assertSuccessResponse(
    linkResponse,
    `POST /v1/organisations/${refNo}/link`
  )

  const basePath = `/v1/organisations/${refNo}/registrations/${registrationId}/reports/${year}/${cadence}/${period}/submissions/1`

  const createResponse = await baseAPI.post(basePath, '', defraAuthHeader)

  await assertSuccessResponse(createResponse, `POST ${basePath}`)

  let version

  let patchResponse = await baseAPI.patch(
    basePath,
    JSON.stringify({
      tonnageRecycled: 10,
      tonnageNotRecycled: 0,
      prnRevenue: 0,
      freeTonnage: 0
    }),
    jsonHeaders
  )

  patchResponse = await assertSuccessResponse(
    patchResponse,
    `PATCH ${basePath}`
  )

  version = patchResponse.version

  const readyResponse = await baseAPI.post(
    `${basePath}/status`,
    JSON.stringify({ status: 'ready_to_submit', version }),
    jsonHeaders
  )

  await assertSuccessResponse(readyResponse, `POST ${basePath}/status`)
  version += 1

  const submitResponse = await baseAPI.post(
    `${basePath}/status`,
    JSON.stringify({
      status: 'submitted',
      version,
      submissionDeclaredBy: 'Test User'
    }),
    jsonHeaders
  )

  await assertSuccessResponse(submitResponse, `POST ${basePath}/status`)

  return { organisationId: refNo, registrationId, year, cadence, period }
}

// Creates and submits a specific report submission for a period, driving the
// create → patch → ready_to_submit → submitted state machine. Unlike
// createSubmittedReport this targets an explicit year/cadence/period, so it
// can seed a period matching a summary log fixture, and an explicit
// submissionNumber. Submission numbers above 1 are resubmissions: the backend
// only permits them once the period's latest submitted report is marked as
// requiring resubmission (see uploadAndSubmitSummaryLog).
// Must match the REGISTRATION_NUMBER meta cell inside the fixture spreadsheet.
const RESTATED_REGISTRATION_NUMBER = generateRegNumber({
  wasteProcessingType: 'reprocessor',
  materialSuffix: 'PA',
  serial: '0004',
  year: '26'
})
const RESTATED_CMA_FIXTURE = 'test/fixtures/reprocessor-output-regonly-cma.xlsx'
// The period the CMA fixture restates. Consumers render it differently
// ('Q1 2026' in the CSV, 'Quarter 1' in the admin table), so labels live with
// the spec that reads them.
export const RESTATED_PERIOD = { year: 2026, cadence: 'quarterly', period: 1 }

/**
 * Seeds a registered-only reprocessor whose Q1 2026 is submitted, then restated
 * by a summary log so the period is flagged requires_resubmission.
 *
 * That flag is the precondition for creating submission 2 at all, and there is
 * no endpoint for it: the backend sets it as a side effect of submitting the
 * summary log, which is why a real fixture is uploaded here.
 *
 * @param {{ tonnageRecycled?: number }} [options]
 * @returns {Promise<{ refNo: string, companyName: string, registrationId: string, defraAuthHeader: {Authorization?: string} }>}
 */
export async function seedRestatedClosedPeriod({ tonnageRecycled = 100 } = {}) {
  const linkedOrganisation = await createLinkedOrganisation([
    {
      material: 'Paper or board (R3)',
      wasteProcessingType: 'Reprocessor',
      withoutAccreditation: true
    }
  ])
  const refNo = linkedOrganisation.refNo
  const companyName = linkedOrganisation.organisation.companyName

  const migrated = await updateMigratedOrganisation(refNo, [
    {
      regNumber: RESTATED_REGISTRATION_NUMBER,
      status: 'approved',
      reprocessingType: 'output'
    }
  ])
  // updateMigratedOrganisation here returns { email, registrationIds,
  // accreditationIds } (this repo's merged version), not the raw org record
  // upstream's simpler version returns - use the id array it actually gives.
  const registrationId = migrated.registrationIds[0]

  const orgData = await getOrganisation(refNo)
  const user = await registerAndLinkDefraIdUser(
    refNo,
    orgData.submitterContactDetails.email
  )
  const defraAuthHeader = defraIdStub.authHeader(user.userId)

  await seedReportSubmission(
    refNo,
    registrationId,
    defraAuthHeader,
    { ...RESTATED_PERIOD, submissionNumber: 1 },
    { tonnageRecycled, tonnageNotRecycled: 0 }
  )
  await uploadAndSubmitSummaryLog(
    refNo,
    registrationId,
    defraAuthHeader,
    RESTATED_CMA_FIXTURE
  )
  await waitForReportingPeriodStatus(
    refNo,
    registrationId,
    defraAuthHeader,
    'requires_resubmission'
  )

  return { refNo, companyName, registrationId, defraAuthHeader }
}

const submissionPath = (
  refNo,
  registrationId,
  { year, cadence, period, submissionNumber }
) =>
  `/v1/organisations/${refNo}/registrations/${registrationId}/reports/${year}/${cadence}/${period}/submissions/${submissionNumber}`

// Creates a submission and leaves it in_progress, returning the version the
// next transition needs. An in-flight draft is a state under test in its own
// right: it must not disturb what the period has already submitted.
export async function seedDraftSubmission(
  refNo,
  registrationId,
  defraAuthHeader,
  periodSubmission,
  // Deliberately narrower than createSubmittedReport's patch: prnRevenue and
  // freeTonnage are optional PRN fields that only apply to accredited
  // registrations, and this helper seeds registered-only ones.
  patchFields = { tonnageRecycled: 100, tonnageNotRecycled: 0 }
) {
  const baseAPI = new BaseAPI()
  const jsonHeaders = { ...defraAuthHeader, 'content-type': 'application/json' }
  const basePath = submissionPath(refNo, registrationId, periodSubmission)

  const createResponse = await baseAPI.post(basePath, '', defraAuthHeader)
  await assertSuccessResponse(createResponse, `POST ${basePath}`)

  const patchResponse = await assertSuccessResponse(
    await baseAPI.patch(basePath, JSON.stringify(patchFields), jsonHeaders),
    `PATCH ${basePath}`
  )

  return patchResponse.version
}

// Drives an in_progress submission through ready_to_submit → submitted.
export async function submitSeededDraft(
  refNo,
  registrationId,
  defraAuthHeader,
  periodSubmission,
  version
) {
  const baseAPI = new BaseAPI()
  const jsonHeaders = { ...defraAuthHeader, 'content-type': 'application/json' }
  const basePath = submissionPath(refNo, registrationId, periodSubmission)

  const readyResponse = await baseAPI.post(
    `${basePath}/status`,
    JSON.stringify({ status: 'ready_to_submit', version }),
    jsonHeaders
  )
  await assertSuccessResponse(readyResponse, `POST ${basePath}/status`)

  const submitResponse = await baseAPI.post(
    `${basePath}/status`,
    JSON.stringify({
      status: 'submitted',
      version: version + 1,
      submissionDeclaredBy: 'Test User'
    }),
    jsonHeaders
  )
  await assertSuccessResponse(submitResponse, `POST ${basePath}/status`)
}

export async function seedReportSubmission(
  refNo,
  registrationId,
  defraAuthHeader,
  periodSubmission,
  patchFields = { tonnageRecycled: 100, tonnageNotRecycled: 0 }
) {
  const version = await seedDraftSubmission(
    refNo,
    registrationId,
    defraAuthHeader,
    periodSubmission,
    patchFields
  )
  await submitSeededDraft(
    refNo,
    registrationId,
    defraAuthHeader,
    periodSubmission,
    version
  )
}
