import {
  Accreditation,
  Organisation,
  Registration
} from '../support/generator.js'

import { fakerEN_GB } from '@faker-js/faker'
import { expect } from '@wdio/globals'
import { request } from 'undici'
import { randomUUID } from 'crypto'
import { readFile } from 'node:fs/promises'
import { BaseAPI } from '../apis/base-api.js'
import config from '../config/config.js'
import { AuthClient } from './auth.js'
import { trackCreatedOrgId } from './cleanup-tracker.js'
import { defraIdStub } from './defra-id-stub.js'
import { MATERIALS } from './materials.js'

// Entra tokens go through the shared AuthClient above (createSubmittedReport,
// getOrganisation). Defra ID user tokens below still use a private
// getDefraUserToken rather than the shared defraIdStub: unlike AuthClient,
// defraIdStub connects via config.defraIdUri's hostname directly (relying on
// that hostname resolving, e.g. via a docker-compose-provided /etc/hosts
// entry) rather than localhost + an explicit Host header override, and its
// register/authorise/generateToken methods don't send that override either -
// so a straight migration would swap a proven-working local flow for one
// that's never actually been exercised by a passing test. Worth fixing
// defraIdStub itself in a follow-up rather than duplicating the workaround.

// Registers a throwaway user with the Defra ID stub and returns a Bearer token
// with standardUser scope for the given defraOrgId.
// The Host header is spoofed on every request so the stub embeds
// http://defra-id-stub:3200/cdp-defra-id-stub as the JWT issuer — which is
// what the backend is configured to trust.
async function getDefraUserToken(email, orgId = randomUUID()) {
  const stubUrl = 'http://localhost:3200'
  const stubHost = 'defra-id-stub:3200'
  const userId = randomUUID()
  const clientId = '63983fc2-cfff-45bb-8ec2-959e21062b9a'

  await request(`${stubUrl}/cdp-defra-id-stub/API/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', host: stubHost },
    body: JSON.stringify({
      userId,
      email,
      firstName: 'Test',
      lastName: 'User',
      loa: '1',
      aal: '1',
      enrolmentCount: 1,
      enrolmentRequestCount: 1
    })
  })

  const relParams = new URLSearchParams({
    csrfToken: randomUUID(),
    userId,
    relationshipId: 'relId1',
    organisationId: orgId,
    organisationName: 'Test Organisation',
    relationshipRole: 'role',
    roleName: 'User',
    roleStatus: 'Status',
    // eslint-disable-next-line camelcase
    redirect_uri: 'http://localhost:3000/'
  })
  await request(
    `${stubUrl}/cdp-defra-id-stub/register/${userId}/relationship`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        host: stubHost
      },
      body: relParams.toString()
    }
  )

  const authParams = new URLSearchParams({
    user: email,
    // eslint-disable-next-line camelcase
    client_id: clientId,
    // eslint-disable-next-line camelcase
    response_type: 'code',
    // eslint-disable-next-line camelcase
    redirect_uri: 'http://0.0.0.0:3001/health',
    state: 'state',
    scope: 'email'
  })
  const authResponse = await request(
    `${stubUrl}/cdp-defra-id-stub/authorize?${authParams.toString()}`,
    { method: 'GET', headers: { host: stubHost } }
  )
  if (authResponse.statusCode !== 302) {
    const body = await authResponse.body.text()
    throw new Error(
      `Defra ID authorize returned ${authResponse.statusCode}: ${body}`
    )
  }

  const headers = await authResponse.headers
  const headersLocation = String(headers.location)
  const sessionId = headersLocation.split('sessionId=')[1]

  const tokenResponse = await request(`${stubUrl}/cdp-defra-id-stub/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', host: stubHost },
    body: JSON.stringify({
      // eslint-disable-next-line camelcase
      client_id: clientId,
      // eslint-disable-next-line camelcase
      client_secret: 'test_value',
      // eslint-disable-next-line camelcase
      grant_type: 'authorization_code',
      code: sessionId
    })
  })

  /**
   * @typedef {Object} AuthResponse
   * @property {string} access_token
   * @property {string} token_type
   * @property {number} expires_in
   */
  const tokenData = /** @type {AuthResponse} */ (
    await tokenResponse.body.json()
  )
  return tokenData.access_token
}

// Returns the most recently completed reporting period for the given cadence.
// Quarterly: periods 1–4 map to Q1–Q4. Monthly: periods 1–12 map to Jan–Dec.
function lastCompletedPeriod(cadence) {
  const now = new Date()
  const month = now.getUTCMonth() + 1
  const year = now.getUTCFullYear()

  if (cadence === 'monthly') {
    return month === 1
      ? { year: year - 1, period: 12 }
      : { year, period: month - 1 }
  }

  const currentQuarter = Math.ceil(month / 3)
  return currentQuarter === 1
    ? { year: year - 1, period: 4 }
    : { year, period: currentQuarter - 1 }
}

async function assertSuccessResponse(response, context) {
  const body = await response.body.json()
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(
      `${context}: expected 2xx but got ${response.statusCode}\n${JSON.stringify(body, null, 2)}`
    )
  }
  return body
}

async function assertSuccessResponseWithoutBody(response, context) {
  if (response.statusCode < 200 || response.statusCode >= 300) {
    const body = await response.body.json()
    throw new Error(
      `${context}: expected 2xx but got ${response.statusCode}\n${JSON.stringify(body, null, 2)}`
    )
  }
}

export async function createOrgWithAllWasteProcessingTypeAllMaterials() {
  const wasteProcessingTypes = [
    {
      wasteProcessingType: 'Reprocessor',
      street: 'reprocessor input street',
      type: 'input'
    },
    {
      wasteProcessingType: 'Reprocessor',
      street: 'reprocessor output street',
      type: 'output'
    },
    { wasteProcessingType: 'Exporter', street: 'exporter street', type: '' }
  ]
  const dataRows = []

  for (const wasteProcessingType of wasteProcessingTypes) {
    for (const material of MATERIALS) {
      const updateDataRow = {}
      updateDataRow.material = material.material
      updateDataRow.glassRecyclingProcess = material.glassRecyclingProcess
      updateDataRow.wasteProcessingType =
        wasteProcessingType.wasteProcessingType
      updateDataRow.street = wasteProcessingType.street
      dataRows.push(updateDataRow)
    }
  }

  const organisationDetails = await createLinkedOrganisation(dataRows)

  const updateDataRows = []
  for (let i = 0; i < wasteProcessingTypes.length; i++) {
    for (const material of MATERIALS) {
      let prefix = 'E'
      const updateDataRow = {}
      if (wasteProcessingTypes[i].type !== '') {
        updateDataRow.reprocessingType = wasteProcessingTypes[i].type
        prefix = 'R'
      }
      updateDataRow.regNumber = `${prefix}25SR5000${i}0912${material.suffix}`
      updateDataRow.accNumber = `${prefix}-ACC12${i}45${material.suffix}`
      updateDataRow.status = 'approved'
      updateDataRows.push(updateDataRow)
    }
  }

  updateDataRows[0].email = `sanity_${fakerEN_GB.internet.email()}`

  const migratedOrganisation = await updateMigratedOrganisation(
    organisationDetails.refNo,
    updateDataRows
  )

  const userEmail = migratedOrganisation.email
  return { organisationDetails, userEmail }
}

// Examples
// dataRows = [{ material: 'Paper or board (R3)', wasteProcessingType: 'Reprocessor'}, { material: 'Steel (R4)', wasteProcessingType: 'Exporter'}]
export async function createLinkedOrganisation(dataRows) {
  const baseAPI = new BaseAPI()

  const organisation = new Organisation()
  let payload = ''
  if (dataRows[0].wasteProcessingType === 'Reprocessor') {
    payload = organisation.toNonRegisteredUKSoleTraderPayload()
  } else {
    payload = organisation.toPayload()
  }

  let response = await baseAPI.post(
    '/v1/apply/organisation',
    JSON.stringify(payload)
  )
  expect(response.statusCode).toBe(200)

  /**
   * @typedef {Object} OrgCreatedResponse
   * @property {number} orgId
   * @property {string} orgName
   * @property {string} referenceNumber
   */
  const orgResponseData = /** @type {OrgCreatedResponse} */ (
    await response.body.json()
  )

  const orgId = orgResponseData?.orgId
  trackCreatedOrgId(orgId)
  const refNo = orgResponseData?.referenceNumber

  const registrations = []

  for (const dataRow of dataRows) {
    let material = 'Paper or board (R3)'
    const glassRecyclingProcess = dataRow.glassRecyclingProcess?.trim()
    if (dataRow.material !== '') {
      material = dataRow.material
    }
    let registration = new Registration(orgId, refNo)
    if (dataRow.street !== '') {
      registration = new Registration(orgId, refNo, dataRow.street)
    }
    payload =
      dataRow.wasteProcessingType === 'Reprocessor'
        ? registration.toAllMaterialsPayload(material, glassRecyclingProcess)
        : registration.toExporterPayload(material, glassRecyclingProcess)
    response = await baseAPI.post(
      '/v1/apply/registration',
      JSON.stringify(payload)
    )
    expect(response.statusCode).toBe(201)
    registrations.push(registration)

    if (!dataRow.withoutAccreditation) {
      const accreditation = new Accreditation(orgId, refNo)
      accreditation.postcode = registration.postcode
      payload =
        dataRow.wasteProcessingType === 'Reprocessor'
          ? accreditation.toReprocessorPayload(material, glassRecyclingProcess)
          : accreditation.toExporterPayload(material, glassRecyclingProcess)

      response = await baseAPI.post(
        '/v1/apply/accreditation',
        JSON.stringify(payload)
      )
      expect(response.statusCode).toBe(201)
    }
  }

  response = await baseAPI.post(`/v1/dev/form-submissions/${refNo}/migrate`, '')
  expect(response.statusCode).toBe(200)

  return { orgId, refNo, organisation, registrations }
}

// Examples for updateDataRows:
// [ { reprocessingType: 'input', regNumber: 'R25SR500030912PA', accNumber: 'ACC123456', status: 'approved' }]
export async function updateMigratedOrganisation(
  orgId,
  updateDataRows,
  submittedToRegulator,
  validFrom = '2026-01-01'
) {
  const authClient = new AuthClient()
  const baseAPI = new BaseAPI()

  await authClient.authenticate()

  const timeout = 5000
  const startTime = Date.now()

  let response
  // Poll for 5 seconds until organisation is available
  while (Date.now() - startTime < timeout) {
    response = await baseAPI.get(
      `/v1/organisations/${orgId}`,
      authClient.authHeader()
    )
    if (response.statusCode < 200 || response.statusCode >= 300) {
      await new Promise((resolve) => setTimeout(resolve, 1000))
    } else {
      break
    }
  }

  const responseData = await assertSuccessResponse(
    response,
    `GET /v1/organisations/${orgId}`
  )

  const currentYear = new Date().getFullYear()

  const data = responseData
  let accreditationIndex = 0

  const accreditationIds = []
  const registrationIds = []

  for (let i = 0; i < updateDataRows.length; i++) {
    const orgUpdateData = updateDataRows[i]
    data.registrations[i].status = orgUpdateData.status
    data.registrations[i].validFrom = validFrom
    data.registrations[i].validTo = `${currentYear + 1}-01-01`
    data.registrations[i].registrationNumber = orgUpdateData.regNumber
    data.registrations[i].statusHistory = [
      ...(data.registrations[i].statusHistory || []),
      {
        status: orgUpdateData.status,
        updatedAt: data.registrations[i].validFrom
      }
    ]
    data.registrations[i].statusHistory = (
      data.registrations[i].statusHistory || []
    ).map((entry) => {
      if (entry.status === 'created') {
        return {
          ...entry,
          updatedAt: '2025-12-31'
        }
      }
      return entry
    })
    if (orgUpdateData.validFrom?.trim()) {
      data.registrations[i].validFrom = orgUpdateData.validFrom
    }
    if (orgUpdateData.reprocessingType?.trim()) {
      data.registrations[i].reprocessingType = orgUpdateData.reprocessingType
    }
    if (orgUpdateData.glassRecyclingProcess?.trim()) {
      data.registrations[i].glassRecyclingProcess = [
        orgUpdateData.glassRecyclingProcess
      ]
    }
    if (submittedToRegulator) {
      data.registrations[i].submittedToRegulator = submittedToRegulator
    }

    registrationIds.push(data.registrations[i].id)

    if (
      !orgUpdateData.withoutAccreditation &&
      data.accreditations[accreditationIndex]
    ) {
      const j = accreditationIndex
      data.registrations[i].accreditationId = data.accreditations[j].id
      data.accreditations[j].status = orgUpdateData.status
      data.accreditations[j].validFrom = validFrom
      data.accreditations[j].validTo = `${currentYear + 1}-01-01`
      data.accreditations[j].statusHistory = [
        ...(data.accreditations[j].statusHistory || []),
        {
          status: orgUpdateData.status,
          updatedAt: data.accreditations[j].validFrom
        }
      ]
      data.accreditations[j].statusHistory = (
        data.accreditations[j].statusHistory || []
      ).map((entry) => {
        if (entry.status === 'created') {
          return {
            ...entry,
            updatedAt: '2025-12-31'
          }
        }
        return entry
      })
      if (orgUpdateData.validFrom?.trim()) {
        data.accreditations[j].validFrom = orgUpdateData.validFrom
      }
      if (orgUpdateData.reprocessingType?.trim()) {
        data.accreditations[j].reprocessingType = orgUpdateData.reprocessingType
      }
      if (orgUpdateData.glassRecyclingProcess?.trim()) {
        data.accreditations[j].glassRecyclingProcess = [
          orgUpdateData.glassRecyclingProcess
        ]
      }
      data.accreditations[j].accreditationNumber = orgUpdateData.accNumber
      if (submittedToRegulator) {
        data.accreditations[j].submittedToRegulator = submittedToRegulator
      }
      accreditationIds.push(data.accreditations[j].id)
      accreditationIndex++
    }
  }

  if (submittedToRegulator) {
    data.submittedToRegulator = submittedToRegulator
  }

  let email = ''
  if (updateDataRows[0].email) {
    email = updateDataRows[0].email
  } else {
    // Replace email address with a newly generated one in Environment to avoid same email address all the time
    email = process.env.ENVIRONMENT
      ? fakerEN_GB.internet.email()
      : data.submitterContactDetails.email
  }
  data.submitterContactDetails.email = email

  data.status = updateDataRows[0].status
  data.statusHistory = [
    ...(data.statusHistory || []),
    {
      status: updateDataRows[0].status,
      updatedAt: data.registrations[0].validFrom
    }
  ]
  const payload = {
    version: Number(data.version),
    updateFragment: data
  }

  response = await baseAPI.put(
    `/v1/organisations/${orgId}`,
    JSON.stringify(payload),
    authClient.authHeader()
  )
  await assertSuccessResponse(response, `PUT /v1/organisations/${orgId}`)

  return { email, registrationIds, accreditationIds }
}

export async function updateStatus(orgId, newStatus) {
  const authClient = new AuthClient()
  const baseAPI = new BaseAPI()

  await authClient.authenticate()

  let response = await baseAPI.get(
    `/v1/organisations/${orgId}`,
    authClient.authHeader()
  )

  const data = await assertSuccessResponse(
    response,
    `GET /v1/organisations/${orgId}`
  )

  data.accreditations[0].status = newStatus
  const statusChangeDate = new Date(data.accreditations[0].validFrom)
  statusChangeDate.setDate(statusChangeDate.getDate() + 1)
  data.accreditations[0].statusHistory = [
    ...(data.accreditations[0].statusHistory || []),
    {
      status: newStatus,
      updatedAt: statusChangeDate.toISOString().split('T')[0]
    }
  ]

  const payload = {
    version: Number(data.version),
    updateFragment: data
  }

  response = await baseAPI.put(
    `/v1/organisations/${orgId}`,
    JSON.stringify(payload),
    authClient.authHeader()
  )

  await assertSuccessResponseWithoutBody(
    response,
    `PUT /v1/organisations/${orgId}`
  )
}

/**
 * Seeds overseas site records and links them to an exporter registration.
 * Creates a single approved overseas site, then maps a 3-digit ORS key
 * on the specified registration so that ORS waste balance
 * validation passes for any OSR ID in the summary log data.
 *
 * @param {string} orgRefNo - Organisation reference number
 * @param {number[]} registrationIndices - Indices of the exporter registration
 * @param orsIds - Array of ORS IDs to link to the registration
 */
export async function seedOverseasSites(
  orgRefNo,
  registrationIndices = [0],
  orsIds = [100]
) {
  const authClient = new AuthClient()
  const baseAPI = new BaseAPI()

  await authClient.authenticate()

  const siteResponse = await baseAPI.post(
    '/v1/overseas-sites',
    JSON.stringify({
      name: 'Test Overseas Reprocessor',
      address: {
        line1: '1 Test Street',
        townOrCity: 'Test City'
      },
      country: 'Germany',
      validFrom: '2024-01-01'
    }),
    authClient.authHeader()
  )
  const site = await assertSuccessResponse(
    siteResponse,
    'POST /v1/overseas-sites'
  )

  const orgResponse = await baseAPI.get(
    `/v1/organisations/${orgRefNo}`,
    authClient.authHeader()
  )
  const orgData = await assertSuccessResponse(
    orgResponse,
    `GET /v1/organisations/${orgRefNo}`
  )

  const overseasSites = {}
  orsIds.forEach((orsId) => {
    overseasSites[orsId] = {
      overseasSiteId: site.id
    }
  })
  registrationIndices.forEach((registrationIndex) => {
    orgData.registrations[registrationIndex].overseasSites = overseasSites
  })

  const payload = {
    version: Number(orgData.version),
    updateFragment: orgData
  }

  const putResponse = await baseAPI.put(
    `/v1/organisations/${orgRefNo}`,
    JSON.stringify(payload),
    authClient.authHeader()
  )

  await assertSuccessResponse(putResponse, `PUT /v1/organisations/${orgRefNo}`)
}

export default seedOverseasSites

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
 * precondition for closed-month-adjustment detection in the enhanced check page.
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

export async function externalAPICancelPrn(prnDetails) {
  await config.cognitoAuth.generateToken()

  const baseAPI = new BaseAPI()
  const response = await baseAPI.post(
    `/v1/packaging-recycling-notes/${prnDetails.prnNumber}/reject`,
    JSON.stringify({ rejectedAt: new Date().toISOString() }),
    config.cognitoAuth.authHeader()
  )

  await assertSuccessResponseWithoutBody(
    response,
    `POST /v1/packaging-recycling-notes/${prnDetails.prnNumber}/reject`
  )
  prnDetails.status = 'Awaiting cancellation'
}

export async function externalAPIAcceptPrn(prnDetails) {
  await config.cognitoAuth.generateToken()

  const baseAPI = new BaseAPI()
  const response = await baseAPI.post(
    `/v1/packaging-recycling-notes/${prnDetails.prnNumber}/accept`,
    JSON.stringify({ acceptedAt: new Date().toISOString() }),
    config.cognitoAuth.authHeader()
  )

  await assertSuccessResponseWithoutBody(
    response,
    `POST /v1/packaging-recycling-notes/${prnDetails.prnNumber}/accept`
  )
  prnDetails.status = 'Accepted'
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

export async function getOrganisation(refNo) {
  const baseAPI = new BaseAPI()
  const authClient = new AuthClient()
  await authClient.authenticate()
  const orgResponse = await baseAPI.get(
    `/v1/organisations/${refNo}`,
    authClient.authHeader()
  )
  return await assertSuccessResponse(orgResponse, `/v1/organisations/${refNo}`)
}

// Registers a Defra ID user for the organisation's submitter contact email
// and links it, returning the bearer header the operator-facing report and
// summary-log endpoints require (the service maintainer token 403s on them).
export async function linkDefraUser(refNo) {
  const baseAPI = new BaseAPI()
  const orgData = await getOrganisation(refNo)
  const email = orgData.submitterContactDetails.email

  const defraToken = await getDefraUserToken(email)
  const defraAuthHeader = { Authorization: `Bearer ${defraToken}` }

  const linkResponse = await baseAPI.post(
    `/v1/organisations/${refNo}/link`,
    '',
    defraAuthHeader
  )
  await assertSuccessResponse(
    linkResponse,
    `POST /v1/organisations/${refNo}/link`
  )

  return { defraAuthHeader, email }
}

// Creates and submits a specific report submission for a period, driving the
// create → patch → ready_to_submit → submitted state machine. Unlike
// createSubmittedReport this targets an explicit year/cadence/period, so it
// can seed a period matching a summary log fixture, and an explicit
// submissionNumber. Submission numbers above 1 are resubmissions: the backend
// only permits them once the period's latest submitted report is marked as
// requiring resubmission (see uploadAndSubmitSummaryLog).
// Must match the REGISTRATION_NUMBER meta cell inside the fixture spreadsheet.
const RESTATED_REGISTRATION_NUMBER = 'R25SR500040912PA'
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
 * @returns {Promise<{ refNo: string, companyName: string, registrationId: string, defraAuthHeader: Record<string, string> }>}
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
  const { defraAuthHeader } = await linkDefraUser(refNo)

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

const SUMMARY_LOG_FAILURE_STATUSES = [
  'invalid',
  'rejected',
  'validation_failed',
  'submission_failed'
]

async function waitForSummaryLogStatus(
  baseAPI,
  summaryLogPath,
  defraAuthHeader,
  targetStatus
) {
  const timeoutMs = 90000
  const startTime = Date.now()
  let status

  while (Date.now() - startTime < timeoutMs) {
    const response = await baseAPI.get(summaryLogPath, defraAuthHeader)
    ;({ status } = await assertSuccessResponse(
      response,
      `GET ${summaryLogPath}`
    ))
    if (status === targetStatus) {
      return
    }
    if (SUMMARY_LOG_FAILURE_STATUSES.includes(status)) {
      throw new Error(
        `Summary log reached '${status}' while waiting for '${targetStatus}'`
      )
    }
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }

  throw new Error(
    `Timed out waiting for summary log status '${targetStatus}' (last seen: '${status}')`
  )
}

// Drives the full summary-log pipeline over HTTP without the operator
// frontend: initiate (backend) → multipart file POST (cdp-uploader) → poll
// until validated → submit → poll until submitted. On submit the backend
// flags any restated closed periods as requiring resubmission, which is what
// unlocks creating submission 2 for those periods.
export async function uploadAndSubmitSummaryLog(
  refNo,
  registrationId,
  defraAuthHeader,
  filePath
) {
  const baseAPI = new BaseAPI()
  const jsonHeaders = { ...defraAuthHeader, 'content-type': 'application/json' }
  const summaryLogsPath = `/v1/organisations/${refNo}/registrations/${registrationId}/summary-logs`

  const initiateResponse = await baseAPI.post(
    summaryLogsPath,
    JSON.stringify({ redirectUrl: '/' }),
    jsonHeaders
  )
  const { summaryLogId, uploadUrl } = await assertSuccessResponse(
    initiateResponse,
    `POST ${summaryLogsPath}`
  )

  // The backend addresses cdp-uploader by its container hostname; from the
  // test host the same service is published on localhost:7337.
  const hostUploadUrl = new URL(
    new URL(uploadUrl).pathname,
    'http://localhost:7337'
  )

  // The field name must be summaryLogUpload: cdp-uploader echoes the form
  // shape back to the backend callback, whose schema requires that key.
  const form = new FormData()
  form.append(
    'summaryLogUpload',
    new Blob([await readFile(filePath)], {
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

export async function linkOrganisationToDefraId(refNo, email) {
  const baseAPI = new BaseAPI()

  const orgId = randomUUID()
  const defraToken = await getDefraUserToken(email, orgId)
  const defraAuthHeader = { Authorization: `Bearer ${defraToken}` }

  const linkResponse = await baseAPI.post(
    `/v1/organisations/${refNo}/link`,
    '',
    defraAuthHeader
  )

  await assertSuccessResponse(
    linkResponse,
    `POST /v1/organisations/${refNo}/link`
  )
  return { defraOrgId: orgId, defraOrgName: 'Test Organisation' }
}
