import {
  createAndRegisterDefraIdUser,
  linkDefraIdUser
} from '../defra-id-linking.js'
import { defraIdStub } from '../defra-id-stub.js'
import { generateNumbers } from '../reg-acc-number.js'
import { generateSummaryLogContent } from '../spreadsheet/summarylogs-content-generator.js'
import {
  createLinkedOrganisation,
  getDecemberPrnEligibility,
  updateMigratedOrganisation
} from './organisation.js'
import {
  registrationStartYear,
  submitSummaryLogContent
} from './summary-logs.js'
import { waitForWasteBalance } from './waiters.js'

/**
 * Seeds an approved, accredited output reprocessor with a 100 tonne waste
 * balance - an output reprocessor can raise a December PRN against any of it -
 * and reads from the backend whether the December Waste window is open for it.
 *
 * @returns {Promise<{
 *   refNo: string,
 *   orgId: number,
 *   registrationId: string,
 *   registrationNumber: string,
 *   accreditationId: string,
 *   email: string,
 *   authHeader: {Authorization?: string},
 *   windowOpen: boolean
 * }>}
 */
export async function seedAccreditedOutputReprocessor() {
  const { regNumber, accNumber } = generateNumbers({
    wasteProcessingType: 'reprocessor',
    materialSuffix: 'ST'
  })

  const org = await createLinkedOrganisation([
    { material: 'Steel (R4)', wasteProcessingType: 'Reprocessor' }
  ])
  const migrated = await updateMigratedOrganisation(org.refNo, [
    { reprocessingType: 'output', regNumber, accNumber, status: 'approved' }
  ])
  const registrationId = migrated.registrationIds[0]
  const accreditationId = migrated.accreditationIds[0]

  const user = await createAndRegisterDefraIdUser(migrated.email)
  await linkDefraIdUser(org.refNo, user.userId, migrated.email)
  const authHeader = defraIdStub.authHeader(user.userId)

  // One pinned row: the generated rows draw "add product weight" at random.
  const content = await generateSummaryLogContent({
    wasteProcessingType: 'reprocessorOutput',
    materialSuffix: 'ST',
    regNumber,
    accNumber,
    rows: {
      'Reprocessed (sections 3 and 4)': [
        {
          rowId: 3001,
          fields: {
            DATE_LOAD_LEFT_SITE: new Date().toLocaleDateString('en-GB'),
            PRODUCT_TONNAGE: 100,
            UK_PACKAGING_WEIGHT_PERCENTAGE: 1,
            PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION: 100,
            ADD_PRODUCT_WEIGHT: 'Yes'
          }
        }
      ]
    }
  })
  await submitSummaryLogContent(
    org.refNo,
    registrationId,
    authHeader,
    content,
    registrationStartYear()
  )
  await waitForWasteBalance(org.refNo, accreditationId, authHeader)

  const { windowOpen } = await getDecemberPrnEligibility(
    org.refNo,
    registrationId,
    accreditationId
  )

  return {
    refNo: org.refNo,
    orgId: org.orgId,
    registrationId,
    registrationNumber: regNumber,
    accreditationId,
    email: migrated.email,
    authHeader,
    windowOpen
  }
}
