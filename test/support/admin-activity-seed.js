import { BaseAPI } from '../apis/base-api.js'
import {
  createAndRegisterDefraIdUser,
  createLinkedOrganisation,
  externalAPIAcceptPrn,
  linkDefraIdUser,
  updateMigratedOrganisation,
  uploadAndSubmitSummaryLog,
  waitForWasteBalance
} from './apicalls.js'
import { defraIdStub } from './defra-id-stub.js'

const FIXTURE_PATH = 'resources/summary-log.xlsx'

async function createPrn(
  baseAPI,
  refNo,
  registrationId,
  accreditationId,
  authHeader,
  tonnage
) {
  const path = `/v1/organisations/${refNo}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes`
  const response = await baseAPI.post(
    path,
    JSON.stringify({
      issuedToOrganisation: {
        id: 'testId',
        name: 'Test Organisation Ltd',
        tradingName: 'Trading Name'
      },
      tonnage
    }),
    authHeader
  )
  if (response.statusCode !== 201) {
    throw new Error(`POST ${path}: expected 201 but got ${response.statusCode}`)
  }
  const body = await response.body.json()
  return { prnId: body.id, prnPath: `${path}/${body.id}` }
}

async function updatePrnStatus(baseAPI, prnPath, authHeader, status) {
  const response = await baseAPI.post(
    `${prnPath}/status`,
    JSON.stringify({ status }),
    authHeader
  )
  if (response.statusCode !== 200) {
    throw new Error(
      `POST ${prnPath}/status (${status}): expected 200 but got ${response.statusCode}`
    )
  }
  return response.body.json()
}

/**
 * Seeds one accredited reprocessor with real activity that the admin
 * reporting pages (waste balance availability, summary log uploads, PRN
 * activity, PRN tonnage, credited tonnage) surface, entirely via the API —
 * a real summary-log upload+submit (for the waste balance, summary log
 * upload row and credited-tonnage row) plus one PRN taken through to
 * 'accepted' (for PRN activity and PRN tonnage). Mirrors
 * prn-state-machine.api.e2e.js's setup, reused here for the admin-side
 * reporting pages rather than the PRN state machine itself.
 * @returns {Promise<{
 *   refNo: string,
 *   orgId: number,
 *   registrationId: string,
 *   accreditationId: string,
 *   accreditationNumber: string,
 *   registrationNumber: string,
 *   prnNumber: string,
 *   tonnage: number
 * }>}
 */
export async function seedAdminActivityData() {
  const baseAPI = new BaseAPI()
  const registrationNumber = 'R25SR500030912PA'
  const accreditationNumber = 'ACC123456'

  const org = await createLinkedOrganisation([
    { wasteProcessingType: 'Reprocessor' }
  ])
  const migrated = await updateMigratedOrganisation(
    org.refNo,
    [
      {
        reprocessingType: 'input',
        regNumber: registrationNumber,
        accNumber: accreditationNumber,
        status: 'approved'
      }
    ],
    'sepa'
  )
  const registrationId = migrated.registrationIds[0]
  const accreditationId = migrated.accreditationIds[0]

  const user = await createAndRegisterDefraIdUser(migrated.email)
  await linkDefraIdUser(org.refNo, user.userId, migrated.email)
  const authHeader = defraIdStub.authHeader(user.userId)

  await uploadAndSubmitSummaryLog(
    org.refNo,
    registrationId,
    authHeader,
    FIXTURE_PATH
  )
  await waitForWasteBalance(org.refNo, accreditationId, authHeader)

  const tonnage = 5
  const { prnPath } = await createPrn(
    baseAPI,
    org.refNo,
    registrationId,
    accreditationId,
    authHeader,
    tonnage
  )
  await updatePrnStatus(baseAPI, prnPath, authHeader, 'awaiting_authorisation')
  const issued = await updatePrnStatus(
    baseAPI,
    prnPath,
    authHeader,
    'awaiting_acceptance'
  )
  await externalAPIAcceptPrn({ prnNumber: issued.prnNumber, status: 'Issued' })

  return {
    refNo: org.refNo,
    orgId: org.orgId,
    registrationId,
    accreditationId,
    accreditationNumber,
    registrationNumber,
    prnNumber: issued.prnNumber,
    tonnage
  }
}
