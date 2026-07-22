import { BaseAPI } from '../../apis/base-api.js'
import { Accreditation, Organisation, Registration } from '../generator.js'
import { trackCreatedOrgId } from '../cleanup-tracker.js'
import logger from '../logger.js'
import config from '../../config/config.js'
import { setGlobalDispatcher } from 'undici'
import { AuthClient } from '../auth.js'
import { MATERIALS } from '../materials.js'
import { createAndRegisterDefraIdUser, linkDefraIdUser } from '../apicalls.js'
import { fakerEN_GB } from '@faker-js/faker'

setGlobalDispatcher(config.undiciAgent)

export { MATERIALS }

export class GeneratorContext {
  constructor() {
    this.baseAPI = new BaseAPI()
    this.authClient = new AuthClient()
  }
}

export async function createOrganisation(context, isNonRegistered) {
  const organisation = new Organisation()
  const organisationPayload = isNonRegistered
    ? organisation.toNonRegisteredUKSoleTraderPayload()
    : organisation.toPayload()

  const orgResponse = await context.baseAPI.post(
    '/v1/apply/organisation',
    JSON.stringify(organisationPayload)
  )
  await assertSuccessResponse(orgResponse, '/v1/apply/organisation')

  const responseData = await orgResponse.body.json()
  const orgId = `${responseData.orgId}`
  trackCreatedOrgId(orgId)
  return {
    organisation,
    referenceNumber: responseData.referenceNumber,
    orgId
  }
}

/**
 * @param {GeneratorContext} context
 * @param {{ organisation: any, orgId: any, referenceNumber: any, material: any, street: string | undefined, isExporter: any, glassRecyclingProcess: any }} params
 */
export async function createRegistration(
  context,
  {
    organisation,
    orgId,
    referenceNumber,
    material,
    street,
    isExporter,
    glassRecyclingProcess
  }
) {
  const registration = street
    ? new Registration(orgId, referenceNumber, street)
    : new Registration(orgId, referenceNumber)

  registration.fullName = organisation.fullName
  registration.email = organisation.email
  registration.phoneNumber = organisation.phoneNumber
  registration.jobTitle = organisation.jobTitle
  registration.refNo = referenceNumber
  registration.orgId = orgId

  const registrationPayload = isExporter
    ? registration.toExporterPayload(material, glassRecyclingProcess)
    : registration.toAllMaterialsPayload(material, glassRecyclingProcess)

  const regResponse = await context.baseAPI.post(
    '/v1/apply/registration',
    JSON.stringify(registrationPayload)
  )
  await assertSuccessResponse(regResponse, '/v1/apply/registration')
  return registration
}

export async function createAccreditation(
  context,
  registration,
  {
    organisation,
    orgId,
    referenceNumber,
    material,
    isExporter,
    glassRecyclingProcess
  }
) {
  const accreditation = new Accreditation(orgId, referenceNumber)
  accreditation.fullName = organisation.fullName
  accreditation.email = organisation.email
  accreditation.phoneNumber = organisation.phoneNumber
  accreditation.jobTitle = organisation.jobTitle
  accreditation.refNo = referenceNumber
  accreditation.orgId = orgId
  accreditation.material = registration.material
  accreditation.postcode = registration.postcode

  const accreditationPayload = isExporter
    ? accreditation.toExporterPayload(material, glassRecyclingProcess)
    : accreditation.toReprocessorPayload(material, glassRecyclingProcess)

  const accResponse = await context.baseAPI.post(
    '/v1/apply/accreditation',
    JSON.stringify(accreditationPayload)
  )
  await assertSuccessResponse(accResponse, '/v1/apply/accreditation')
}

/**
 * @param {GeneratorContext} context
 * @param {{ organisation: any, orgId: any, referenceNumber: any, material: any, street: string | undefined, isExporter: any, glassRecyclingProcess: any }} params
 */
export async function createRegistrationAndAccreditation(
  context,
  {
    organisation,
    orgId,
    referenceNumber,
    material,
    street,
    isExporter,
    glassRecyclingProcess
  }
) {
  const registration = await createRegistration(context, {
    organisation,
    orgId,
    referenceNumber,
    material,
    street,
    isExporter,
    glassRecyclingProcess
  })

  await createAccreditation(context, registration, {
    organisation,
    orgId,
    referenceNumber,
    material,
    isExporter,
    glassRecyclingProcess
  })
}

export async function generateAuthToken(context) {
  await context.authClient.authenticate()
}

export function generateOrgUpdateData(index, suffix, registrationType = '') {
  const baseData = {
    status: 'approved'
  }

  if (registrationType === 'input') {
    return {
      ...baseData,
      regNumber: `R25SR5000${index}0912${suffix}`,
      accNumber: `R-ACC12${index}45${suffix}`,
      reprocessingType: 'input'
    }
  } else if (registrationType === 'output') {
    return {
      ...baseData,
      regNumber: `R25SR5000${index}0912${suffix}`,
      accNumber: `R-ACC12${index}45${suffix}`,
      reprocessingType: 'output'
    }
  } else if (registrationType === 'exporter') {
    return {
      ...baseData,
      regNumber: `E25SR5000${index}0912${suffix}`,
      accNumber: `E-ACC12${index}45${suffix}`
    }
  } else if (registrationType === 'regOnlyReproc') {
    return {
      ...baseData,
      regNumber: `R25SR5000${index}0912${suffix}`,
      reprocessingType: 'input'
    }
  } else if (registrationType === 'regOnlyExporter') {
    return {
      ...baseData,
      regNumber: `E25SR5000${index}0912${suffix}`
    }
  }
}

export async function updateOrganisationData(
  context,
  {
    referenceNumber,
    registrationUpdates,
    emailPrefix,
    validFrom = '2026-01-01'
  }
) {
  const siteResponse = await context.baseAPI.post(
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
    context.authClient.authHeader()
  )
  const site = await assertSuccessResponseWithBody(
    siteResponse,
    'POST /v1/overseas-sites'
  )

  const overseasSites = {
    100: {
      overseasSiteId: site.id
    }
  }

  const getOrgResponse = await context.baseAPI.get(
    `/v1/organisations/${referenceNumber}`,
    context.authClient.authHeader()
  )
  await assertSuccessResponse(
    getOrgResponse,
    `/v1/organisations/${referenceNumber}`
  )

  const data = await getOrgResponse.body.json()
  const currentYear = new Date().getFullYear()

  // Apply updates to registrations and accreditations
  registrationUpdates.forEach(({ index, updateData }) => {
    data.registrations[index].status = updateData.status
    data.registrations[index].validFrom = validFrom
    data.registrations[index].validTo = `${currentYear + 1}-01-01`
    if (updateData.reprocessingType) {
      data.registrations[index].reprocessingType = updateData.reprocessingType
    }
    data.registrations[index].registrationNumber = updateData.regNumber
    data.registrations[index].statusHistory = [
      ...(data.registrations[index].statusHistory || []),
      {
        status: updateData.status,
        updatedAt: data.registrations[index].validFrom
      }
    ]
    data.registrations[index].statusHistory = (
      data.registrations[index].statusHistory || []
    ).map((entry) => {
      if (entry.status === 'created') {
        return {
          ...entry,
          updatedAt: '2025-12-31'
        }
      }
      return entry
    })
    if (data.registrations[index].wasteProcessingType === 'exporter') {
      data.registrations[index].overseasSites = overseasSites
    }
    if (updateData.accNumber) {
      data.registrations[index].accreditationId = data.accreditations[index].id

      data.accreditations[index].status = updateData.status
      data.accreditations[index].validFrom = validFrom
      data.accreditations[index].validTo = `${currentYear + 1}-01-01`
      if (updateData.reprocessingType) {
        data.accreditations[index].reprocessingType =
          updateData.reprocessingType
      }
      data.accreditations[index].accreditationNumber = updateData.accNumber
      data.accreditations[index].statusHistory = [
        ...(data.accreditations[index].statusHistory || []),
        {
          status: updateData.status,
          updatedAt: data.accreditations[index].validFrom
        }
      ]
      data.accreditations[index].statusHistory = (
        data.accreditations[index].statusHistory || []
      ).map((entry) => {
        if (entry.status === 'created') {
          return {
            ...entry,
            updatedAt: '2025-12-31'
          }
        }
        return entry
      })
    }
  })

  // Update email
  let replacementEmail = process.env.ENVIRONMENT
    ? fakerEN_GB.internet.email()
    : data.submitterContactDetails.email
  data.submitterContactDetails.email = `${emailPrefix}_${replacementEmail}`
  replacementEmail = `${emailPrefix}_${replacementEmail}`

  logger.info(
    `Generated email address: ${data.submitterContactDetails.email} | Organisation Reference: ${referenceNumber}`
  )

  data.status =
    registrationUpdates[registrationUpdates.length - 1].updateData.status
  data.statusHistory = [
    ...(data.statusHistory || []),
    {
      status: registrationUpdates[0].updateData.status,
      updatedAt: data.registrations[0].validFrom
    }
  ]

  const payload = {
    version: Number(data.version),
    updateFragment: data
  }

  const patchResponse = await context.baseAPI.put(
    `/v1/organisations/${referenceNumber}`,
    JSON.stringify(payload),
    context.authClient.authHeader()
  )
  await assertSuccessResponse(
    patchResponse,
    `/v1/organisations/${referenceNumber}`
  )

  return replacementEmail
}

export async function linkUser(context, { referenceNumber, email }) {
  const user = await createAndRegisterDefraIdUser(email)
  await linkDefraIdUser(referenceNumber, user.userId, email)
}

export async function migrateFormSubmission(context, referenceNumber) {
  await context.baseAPI.post(
    `/v1/dev/form-submissions/${referenceNumber}/migrate`,
    ''
  )
}

async function assertSuccessResponse(response, context) {
  if (response.statusCode < 200 || response.statusCode >= 300) {
    const body = await response.body.json()
    throw new Error(
      `${context}: expected 2xx but got ${response.statusCode}\n${JSON.stringify(body, null, 2)}`
    )
  }
}

async function assertSuccessResponseWithBody(response, context) {
  const body = await response.body.json()
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(
      `${context}: expected 2xx but got ${response.statusCode}\n${JSON.stringify(body, null, 2)}`
    )
  }
  return body
}
