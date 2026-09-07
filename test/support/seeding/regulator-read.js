import {
  createAndRegisterDefraIdUser,
  linkDefraIdUser
} from '../defra-id-linking.js'
import {
  createLinkedOrganisation,
  lastCompletedPeriod,
  updateMigratedOrganisation
} from './organisation.js'
import { createPrn, externalAPICancelPrn, updatePrnStatus } from './prns.js'
import { seedReportSubmission } from './reports.js'
import { uploadAndSubmitSummaryLog } from './summary-logs.js'
import { waitForWasteBalance } from './waiters.js'
import { defraIdStub } from '../defra-id-stub.js'
import { generateRegNumber, generateAccNumber } from '../reg-acc-number.js'

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

// What submitting the fixture credits the waste balance with. The figure is
// the spreadsheet's own, so a journey reading it back off a page is reading
// the seeded log rather than whatever balance it happened to find.
const SUMMARY_LOG_CREDIT = 391.62
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
 *   cancellationPrnNumber: string,
 *   cancellationPrnTonnage: number,
 *   summaryLogCredit: number,
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
    cancellationPrnNumber: issued.prnNumber,
    cancellationPrnTonnage: CANCELLATION_PRN_TONNAGE,
    summaryLogCredit: SUMMARY_LOG_CREDIT,
    reportPeriod
  }
}

const INPUT_SITE = 'Regulator read - reprocessor input site'
const OUTPUT_SITE = 'Regulator read - reprocessor output site'

/**
 * Seeds one organisation holding three registrations, so a regulator journey
 * can prove the three things a single-registration organisation cannot: that
 * registrations group by site, that reprocessor and exporter registrations
 * are shown apart, and that a registration with no accreditation reads
 * differently from one that carries one.
 *
 * The reprocessor input and output registrations sit at two different sites,
 * so the Reprocessor tab renders two site tables rather than one. The output
 * registration carries no accreditation, so its row is the one that proves
 * the "Not applicable" case rather than the "Approved" one the input
 * registration already covers. The exporter registration lives on its own
 * tab and, unlike a reprocessor's, its table carries no site caption at all.
 *
 * All three registrations and the (two) accreditations are approved
 * over HTTP as the operator, exactly as seedAwaitingPrnAndSubmittedReport
 * does, so a regulator journey can start at sign-in with the data already in
 * place.
 *
 * @returns {Promise<{
 *   companyName: string,
 *   refNo: string,
 *   orgId: number,
 *   inputSite: string,
 *   outputSite: string,
 *   inputRegistrationNumber: string,
 *   outputRegistrationNumber: string,
 *   exporterRegistrationNumber: string
 * }>}
 */
export async function seedMultiSiteMultiTypeOrganisation() {
  const organisation = await createLinkedOrganisation([
    {
      material: 'Paper or board (R3)',
      wasteProcessingType: 'Reprocessor',
      street: INPUT_SITE
    },
    {
      material: 'Steel (R4)',
      wasteProcessingType: 'Reprocessor',
      street: OUTPUT_SITE,
      withoutAccreditation: true
    },
    { material: 'Plastic (R3)', wasteProcessingType: 'Exporter' }
  ])

  const inputRegistrationNumber = generateRegNumber({
    wasteProcessingType: 'reprocessor',
    materialSuffix: 'PA',
    serial: '0201'
  })
  const outputRegistrationNumber = generateRegNumber({
    wasteProcessingType: 'reprocessor',
    materialSuffix: 'ST',
    serial: '0202'
  })
  const exporterRegistrationNumber = generateRegNumber({
    wasteProcessingType: 'exporter',
    materialSuffix: 'PL',
    serial: '0203'
  })

  const migrated = await updateMigratedOrganisation(organisation.refNo, [
    {
      reprocessingType: 'input',
      regNumber: inputRegistrationNumber,
      accNumber: generateAccNumber({
        wasteProcessingType: 'reprocessor',
        materialSuffix: 'PA',
        serial: '0201'
      }),
      status: 'approved'
    },
    {
      // The output registration is deliberately left without an
      // accreditation - withoutAccreditation has to be set on both this row
      // and its matching createLinkedOrganisation row above, or
      // updateMigratedOrganisation's accreditation index drifts by one and
      // stamps a reprocessor accreditation shape onto the exporter's record.
      reprocessingType: 'output',
      regNumber: outputRegistrationNumber,
      status: 'approved',
      withoutAccreditation: true
    },
    {
      regNumber: exporterRegistrationNumber,
      accNumber: generateAccNumber({
        wasteProcessingType: 'exporter',
        materialSuffix: 'PL',
        serial: '0203'
      }),
      status: 'approved'
    }
  ])

  const user = await createAndRegisterDefraIdUser(migrated.email)
  await linkDefraIdUser(organisation.refNo, user.userId, migrated.email)

  return {
    companyName: organisation.organisation.companyName,
    refNo: organisation.refNo,
    orgId: organisation.orgId,
    inputSite: INPUT_SITE,
    outputSite: OUTPUT_SITE,
    inputRegistrationNumber,
    outputRegistrationNumber,
    exporterRegistrationNumber
  }
}
