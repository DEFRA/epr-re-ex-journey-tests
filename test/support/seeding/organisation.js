import { Accreditation, Organisation, Registration } from '../generator.js'

import { fakerEN_GB } from '@faker-js/faker'
import { expect } from 'chai'
import { BaseAPI } from '../../apis/base-api.js'
import { AuthClient } from '../auth.js'
import { trackCreatedOrgId } from '../cleanup-tracker.js'
import { MATERIALS } from '../materials.js'
import { generateRegNumber, generateAccNumber } from '../reg-acc-number.js'
import {
  assertSuccessResponse,
  assertSuccessResponseWithoutBody
} from '../response-assertions.js'

// Returns the most recently completed reporting period for the given cadence.
// Quarterly: periods 1–4 map to Q1–Q4. Monthly: periods 1–12 map to Jan–Dec.
export function lastCompletedPeriod(cadence) {
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

// Filler regNumber/accNumber for specs that need updateMigratedOrganisation
// to approve a registration but never assert the number's actual value.
export const FAKE_REGISTRATION_NUMBER = 'FAKE/REG123/TEST'
export const FAKE_ACCREDITATION_NUMBER = 'FAKE/ACC123/TEST'

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
      let wasteProcessingType = 'exporter'
      const updateDataRow = {}
      if (wasteProcessingTypes[i].type !== '') {
        updateDataRow.reprocessingType = wasteProcessingTypes[i].type
        wasteProcessingType = 'reprocessor'
      }
      const serial = String(i).padStart(4, '0')
      updateDataRow.regNumber = generateRegNumber({
        wasteProcessingType,
        materialSuffix: material.suffix,
        serial
      })
      updateDataRow.accNumber = generateAccNumber({
        wasteProcessingType,
        materialSuffix: material.suffix,
        serial
      })
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
  expect(response.statusCode).to.equal(200)

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
    expect(response.statusCode).to.equal(201)
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
      expect(response.statusCode).to.equal(201)
    }
  }

  response = await baseAPI.post(`/v1/dev/form-submissions/${refNo}/migrate`, '')
  expect(response.statusCode).to.equal(200)

  return {
    orgId,
    refNo,
    organisation,
    registrations,
    regAddresses: registrations.map((registration) => registration.address)
  }
}

// Examples for updateDataRows:
// [ { reprocessingType: 'input', regNumber: 'R26ER5000000003PA', accNumber: 'A26ER5000000002PA', status: 'approved' }]
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
      // accStatus lets the accreditation diverge from the registration's
      // status (e.g. approved registration with a still-created accreditation,
      // ready for the admin grant journey). Defaults to the shared status.
      const accStatus = orgUpdateData.accStatus ?? orgUpdateData.status
      data.registrations[i].accreditationId = data.accreditations[j].id
      data.accreditations[j].status = accStatus
      data.accreditations[j].validFrom = validFrom
      data.accreditations[j].validTo = `${currentYear + 1}-01-01`
      data.accreditations[j].statusHistory =
        accStatus === 'created'
          ? data.accreditations[j].statusHistory || []
          : [
              ...(data.accreditations[j].statusHistory || []),
              {
                status: accStatus,
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

  // Statuses and numbers seed through the non-prod twin of the organisation
  // PUT: the public route rejects status changes (PAE-1645) and the
  // transition endpoints enforce number uniqueness, which the suite's shared
  // fixture workbooks cannot follow.
  response = await baseAPI.put(
    `/v1/dev/organisations/${orgId}`,
    JSON.stringify(payload),
    authClient.authHeader()
  )
  await assertSuccessResponse(response, `PUT /v1/dev/organisations/${orgId}`)

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

  // Statuses and numbers seed through the non-prod twin of the organisation
  // PUT: the public route rejects status changes (PAE-1645) and the
  // transition endpoints enforce number uniqueness, which the suite's shared
  // fixture workbooks cannot follow.
  response = await baseAPI.put(
    `/v1/dev/organisations/${orgId}`,
    JSON.stringify(payload),
    authClient.authHeader()
  )

  await assertSuccessResponseWithoutBody(
    response,
    `PUT /v1/dev/organisations/${orgId}`
  )
}

// Updates the first registration's status (updateStatus above targets the
// accreditation). Cancelling a registration force-cancels its linked
// accreditation (PAE-1705 Scenario 5) — the backend cascades the change, so
// callers only set the registration side.
export async function updateRegistrationStatus(orgId, newStatus) {
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

  data.registrations[0].status = newStatus
  const statusChangeDate = new Date(data.registrations[0].validFrom)
  statusChangeDate.setDate(statusChangeDate.getDate() + 1)
  data.registrations[0].statusHistory = [
    ...(data.registrations[0].statusHistory || []),
    {
      status: newStatus,
      updatedAt: statusChangeDate.toISOString().split('T')[0]
    }
  ]

  const payload = {
    version: Number(data.version),
    updateFragment: data
  }

  // Statuses and numbers seed through the non-prod twin of the organisation
  // PUT: the public route rejects status changes (PAE-1645) and the
  // transition endpoints enforce number uniqueness, which the suite's shared
  // fixture workbooks cannot follow.
  response = await baseAPI.put(
    `/v1/dev/organisations/${orgId}`,
    JSON.stringify(payload),
    authClient.authHeader()
  )

  await assertSuccessResponseWithoutBody(
    response,
    `PUT /v1/dev/organisations/${orgId}`
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
