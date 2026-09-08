import {
  createAndRegisterDefraIdUser,
  linkDefraIdUser
} from '../defra-id-linking.js'
import {
  createLinkedOrganisation,
  updateMigratedOrganisation
} from './organisation.js'
import { uploadAndSubmitSummaryLog } from './summary-logs.js'
import { waitForWasteBalance } from './waiters.js'
import { defraIdStub } from '../defra-id-stub.js'

// The reg/acc numbers baked into both fixtures' Cover sheet: the migration must
// grant these exact numbers so the uploads target the seeded accreditation.
const REGISTRATION_NUMBER = 'R26ER5000000003PA'
const ACCREDITATION_NUMBER = 'A26ER5000000002PA'

// Submitted first: received loads dated in a non-December month, so its ledger
// event carries no December portion (the events page shows a dash).
const NON_DECEMBER_FIXTURE = 'resources/summary-log.xlsx'

// Submitted second: the same loads redated into the accreditation-year December.
// The submission restates the balance, so its ledger event carries the December
// portion (the events page shows the amount).
const DECEMBER_FIXTURE = 'resources/summary-log-december.xlsx'

/**
 * Seeds an accredited reprocessor-on-input with two summary-log submissions: a
 * non-December one, then a December-dated resubmission. The two produce two
 * waste-balance-ledger events, the first without a December portion and the
 * second with one, which is what the admin waste balance events page surfaces.
 *
 * @returns {Promise<{
 *   refNo: string,
 *   orgId: number,
 *   companyName: string,
 *   registrationId: string,
 *   accreditationId: string,
 *   accreditationNumber: string,
 *   registrationNumber: string
 * }>}
 */
export async function seedDecemberWasteBalance() {
  const org = await createLinkedOrganisation([
    { wasteProcessingType: 'Reprocessor' }
  ])
  const migrated = await updateMigratedOrganisation(
    org.refNo,
    [
      {
        reprocessingType: 'input',
        regNumber: REGISTRATION_NUMBER,
        accNumber: ACCREDITATION_NUMBER,
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
    NON_DECEMBER_FIXTURE
  )
  await waitForWasteBalance(org.refNo, accreditationId, authHeader)

  await uploadAndSubmitSummaryLog(
    org.refNo,
    registrationId,
    authHeader,
    DECEMBER_FIXTURE
  )
  await waitForWasteBalance(org.refNo, accreditationId, authHeader)

  return {
    refNo: org.refNo,
    orgId: org.orgId,
    companyName: org.organisation.companyName,
    registrationId,
    accreditationId,
    accreditationNumber: ACCREDITATION_NUMBER,
    registrationNumber: REGISTRATION_NUMBER
  }
}
