import {
  Accreditation,
  Organisation,
  Registration
} from '../support/generator.js'

import { fakerEN_GB } from '@faker-js/faker'
import { expect } from '@wdio/globals'
import { BaseAPI } from '../apis/base-api.js'
import config from '../config/config.js'
import { AuthClient } from './auth.js'
import { trackCreatedOrgId } from './cleanup-tracker.js'
import { defraIdStub } from './defra-id-stub.js'
import { MATERIALS } from './materials.js'
import Users from './users.js'

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

  const regAddresses = []

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
    regAddresses.push(registration.address)

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

  return { refNo, organisation, regAddresses }
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

    if (!orgUpdateData.withoutAccreditation) {
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

export async function createAndRegisterDefraIdUser(email) {
  const users = new Users()
  const user = await users.userPayload(email)
  await defraIdStub.register(JSON.stringify(user))

  return user
}

export async function linkDefraIdUser(organisationId, userId, email) {
  const baseAPI = new BaseAPI()
  const users = new Users()

  const payload = await users.authorisationPayload(email)
  const response = await defraIdStub.authorise(payload)
  if (!response) {
    throw new Error(
      `DefraID stub authorise returned no location header for ${email}`
    )
  }
  const sessionId = response.split('sessionId=')[1]

  const tokenPayload = await users.tokenPayload(sessionId)
  await defraIdStub.generateToken(JSON.stringify(tokenPayload), userId)

  const linkResponse = await baseAPI.post(
    `/v1/organisations/${organisationId}/link`,
    '',
    defraIdStub.authHeader(userId)
  )

  expect(linkResponse.statusCode).toBe(200)
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
 * (defraIdStub.authHeader), NOT the service AuthClient (which 403s) — so
 * linkDefraIdUser must run first.
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
