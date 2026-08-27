import {
  createAndRegisterDefraIdUser,
  createLinkedOrganisation,
  createPrn,
  externalAPICancelPrn,
  lastCompletedPeriod,
  linkDefraIdUser,
  seedReportSubmission,
  updateMigratedOrganisation,
  updatePrnStatus,
  uploadAndSubmitSummaryLog,
  waitForWasteBalance
} from './apicalls.js'
import { defraIdStub } from './defra-id-stub.js'

const FIXTURE_PATH = 'resources/summary-log.xlsx'
export const REGISTRATION_NUMBER = 'R26ER5000000003PA'
const ACCREDITATION_NUMBER = 'A26ER5000000002PA'

// The tonnage each seeded note is worth, and the figures the seeded report
// carries. A journey asserts these back off the page, so they are the values
// that say the page rendered the operator's data rather than an empty shell.
// The two notes carry different tonnages so a journey can tell their rows
// apart without depending on which table it read.
const PRN_TONNAGE = 5
const CANCELLATION_PRN_TONNAGE = 7
const REPORT_FIGURES = {
  tonnageRecycled: 432,
  tonnageNotRecycled: 0,
  prnRevenue: 0,
  freeTonnage: 0
}

/**
 * Seeds one accredited reprocessor holding the things a regulator has any
 * reason to open: a PRN awaiting authorisation, a PRN awaiting cancellation,
 * and a report submitted for the last completed period. All are written over
 * HTTP as the operator, so a regulator journey can start at sign-in with the
 * data already in place.
 *
 * The two notes fill the two tables of the awaiting-action tab, which is the
 * only place either is filed. Neither goes on to issued.
 *
 * Only the last completed period is submitted, which leaves every earlier
 * period in the action-required table - the rows whose action is a write one.
 *
 * @returns {Promise<{
 *   companyName: string,
 *   refNo: string,
 *   registrationNumber: string,
 *   orgId: number,
 *   registrationId: string,
 *   accreditationId: string,
 *   accreditationNumber: string,
 *   prnId: string,
 *   prnTonnage: number,
 *   cancellationPrnId: string,
 *   cancellationPrnTonnage: number,
 *   reportPeriod: {year: number, cadence: string, period: number}
 * }>}
 */
export async function seedAwaitingPrnAndSubmittedReport() {
  const organisation = await createLinkedOrganisation([
    { material: 'Paper or board (R3)', wasteProcessingType: 'Reprocessor' }
  ])

  const migrated = await updateMigratedOrganisation(organisation.refNo, [
    {
      reprocessingType: 'input',
      regNumber: REGISTRATION_NUMBER,
      accNumber: ACCREDITATION_NUMBER,
      status: 'approved'
    }
  ])
  const registrationId = migrated.registrationIds[0]
  const accreditationId = migrated.accreditationIds[0]

  const user = await createAndRegisterDefraIdUser(migrated.email)
  await linkDefraIdUser(organisation.refNo, user.userId, migrated.email)
  const defraAuthHeader = defraIdStub.authHeader(user.userId)

  // A PRN draws its tonnage from the waste balance, which the summary log is
  // what produces - so the log has to be submitted and the balance computed
  // before the note can be created.
  await uploadAndSubmitSummaryLog(
    organisation.refNo,
    registrationId,
    defraAuthHeader,
    FIXTURE_PATH
  )
  await waitForWasteBalance(
    organisation.refNo,
    accreditationId,
    defraAuthHeader
  )

  const { prnId, prnPath } = await createPrn(
    organisation.refNo,
    registrationId,
    accreditationId,
    defraAuthHeader,
    PRN_TONNAGE
  )
  await updatePrnStatus(prnPath, defraAuthHeader, 'awaiting_authorisation')

  // The second note goes all the way out to the recipient, who rejects it -
  // which is what puts a note into awaiting_cancellation and files it into the
  // second table of the awaiting-action tab.
  const cancellation = await createPrn(
    organisation.refNo,
    registrationId,
    accreditationId,
    defraAuthHeader,
    CANCELLATION_PRN_TONNAGE
  )
  await updatePrnStatus(
    cancellation.prnPath,
    defraAuthHeader,
    'awaiting_authorisation'
  )
  const issued = await updatePrnStatus(
    cancellation.prnPath,
    defraAuthHeader,
    'awaiting_acceptance'
  )
  await externalAPICancelPrn({ prnNumber: issued.prnNumber })

  // An approved accreditation carrying a number puts the registration on the
  // monthly cadence, which is what the reports calendar is built from.
  const { year, period } = lastCompletedPeriod('monthly')
  const reportPeriod = { year, cadence: 'monthly', period }
  await seedReportSubmission(
    organisation.refNo,
    registrationId,
    defraAuthHeader,
    { ...reportPeriod, submissionNumber: 1 },
    REPORT_FIGURES
  )

  return {
    companyName: organisation.organisation.companyName,
    refNo: organisation.refNo,
    orgId: organisation.orgId,
    registrationId,
    registrationNumber: REGISTRATION_NUMBER,
    accreditationId,
    accreditationNumber: ACCREDITATION_NUMBER,
    prnId,
    prnTonnage: PRN_TONNAGE,
    cancellationPrnId: cancellation.prnId,
    cancellationPrnTonnage: CANCELLATION_PRN_TONNAGE,
    reportPeriod
  }
}
