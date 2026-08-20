import {
  createAndRegisterDefraIdUser,
  createLinkedOrganisation,
  createPrn,
  externalAPIAcceptPrn,
  linkDefraIdUser,
  updateMigratedOrganisation,
  updatePrnStatus,
  uploadAndSubmitSummaryLog,
  waitForWasteBalance
} from './apicalls.js'
import { defraIdStub } from './defra-id-stub.js'

const FIXTURE_PATH = 'resources/summary-log.xlsx'

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
  const registrationNumber = 'R26ER5000000003PA'
  const accreditationNumber = 'A26ER5000000002PA'

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
    org.refNo,
    registrationId,
    accreditationId,
    authHeader,
    tonnage
  )
  await updatePrnStatus(prnPath, authHeader, 'awaiting_authorisation')
  const issued = await updatePrnStatus(
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
