import {
  createAndRegisterDefraIdUser,
  createLinkedOrganisation,
  createPrn,
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
const REGISTRATION_NUMBER = 'R25SR500030912PA'
const ACCREDITATION_NUMBER = 'ACC123456'

// The tonnage the seeded note is worth, and the figures the seeded report
// carries. A journey asserts these back off the page, so they are the values
// that say the page rendered the operator's data rather than an empty shell.
const PRN_TONNAGE = 5
const REPORT_FIGURES = {
  tonnageRecycled: 432,
  tonnageNotRecycled: 0,
  prnRevenue: 0,
  freeTonnage: 0
}

/**
 * Seeds one accredited reprocessor holding the two things a regulator has any
 * reason to open: a PRN awaiting authorisation, and a report submitted for the
 * last completed period. Both are written over HTTP as the operator, so a
 * regulator journey can start at sign-in with the data already in place.
 *
 * The note stops at awaiting_authorisation rather than going on to issued.
 * That is the state the awaiting-action table holds, and the awaiting tables
 * are the only place such a note appears.
 *
 * Only the last completed period is submitted, which leaves every earlier
 * period in the action-required table - the rows whose action is a write one.
 *
 * @returns {Promise<{
 *   companyName: string,
 *   refNo: string,
 *   orgId: number,
 *   registrationId: string,
 *   accreditationId: string,
 *   accreditationNumber: string,
 *   prnId: string,
 *   prnTonnage: number,
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
    accreditationId,
    accreditationNumber: ACCREDITATION_NUMBER,
    prnId,
    prnTonnage: PRN_TONNAGE,
    reportPeriod
  }
}
