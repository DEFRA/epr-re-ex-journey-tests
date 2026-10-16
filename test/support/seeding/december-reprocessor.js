import {
  createAndRegisterDefraIdUser,
  linkDefraIdUser
} from '../defra-id-linking.js'
import { defraIdStub } from '../defra-id-stub.js'
import { generateNumbers } from '../reg-acc-number.js'
import { generateDecemberFixture } from '../spreadsheet/generate-december-fixture.js'
import { summaryLogContentFromFixture } from '../spreadsheet/summarylogs-content-generator.js'
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
 * Seeds an approved input reprocessor whose waste balance has a December part,
 * and reads from the backend whether the December Waste window is open for it:
 * the window setting differs per environment.
 *
 * @returns {Promise<{
 *   refNo: string,
 *   registrationId: string,
 *   accreditationId: string,
 *   authHeader: {Authorization?: string},
 *   windowOpen: boolean
 * }>}
 */
export async function seedDecemberInputReprocessor() {
  const { regNumber, accNumber } = generateNumbers({
    wasteProcessingType: 'reprocessor',
    materialSuffix: 'PA'
  })
  const accreditationYear = registrationStartYear()

  const org = await createLinkedOrganisation([
    { material: 'Paper or board (R3)', wasteProcessingType: 'Reprocessor' }
  ])
  const migrated = await updateMigratedOrganisation(
    org.refNo,
    [{ reprocessingType: 'input', regNumber, accNumber, status: 'approved' }],
    'sepa'
  )
  const registrationId = migrated.registrationIds[0]
  const accreditationId = migrated.accreditationIds[0]

  const user = await createAndRegisterDefraIdUser(migrated.email)
  await linkDefraIdUser(org.refNo, user.userId, migrated.email)
  const authHeader = defraIdStub.authHeader(user.userId)

  const content = await summaryLogContentFromFixture(
    await generateDecemberFixture(
      {
        wasteProcessingType: 'reprocessorInput',
        materialSuffix: 'PA',
        accNumber,
        regNumber,
        silentLogging: true
      },
      accreditationYear
    )
  )
  await submitSummaryLogContent(
    org.refNo,
    registrationId,
    authHeader,
    content,
    accreditationYear
  )
  await waitForWasteBalance(org.refNo, accreditationId, authHeader)

  const { windowOpen } = await getDecemberPrnEligibility(
    org.refNo,
    registrationId,
    accreditationId
  )

  return {
    refNo: org.refNo,
    registrationId,
    accreditationId,
    authHeader,
    windowOpen
  }
}
