/**
 * Carries out the operator, summary log and report events the calendar plans,
 * against the service through the seeders, under the simulated clock.
 *
 * The caller moves the clock to each event's instant before handing it over,
 * and hands one operator's events over in the order the calendar gives them.
 * See README.md beside this file.
 */

import { monthsOfPeriod, uploadRows } from '../calendar/calendar.js'
import {
  EVENT,
  ISSUE_KIND,
  ISSUE_SEVERITY,
  UPLOAD_OUTCOME
} from '../calendar/events.js'
import { CONTRIBUTION, heldTonnage, rowsForUpload } from '../rows/rows.js'
import {
  applicationRow,
  nationLetter,
  numbersFor,
  regulatorOf,
  reprocessingTypeOf
} from './join.js'
import { liveSeeders } from './seeders.js'

/** @import {PlannedOperator, PlannedPopulation, PlannedRegistration} from '../population/population.js' */
/** @import {PlannedLogRow, PlannedRegistrationRows, PlannedRows} from '../rows/rows.js' */
/** @import {CalendarEvent, PrnEvent, RegistrationEvent, ReportEvent, UploadEvent} from '../calendar/events.js' */
/** @import {Seeders} from './seeders.js' */

/** A Defra ID token lasts an hour, and a clock jump can spend most of that at once. */
const TOKEN_LIFETIME_MS = 60 * 60 * 1000
const TOKEN_MARGIN_MS = 5 * 60 * 1000

/**
 * The plan does not carry a note's tonnage, so a draft takes this share of
 * what the accreditation has available when it is drafted.
 */
const NOTE_SHARE_OF_AVAILABLE = 1 / 3

/**
 * @typedef {Object} PlannedRegistrationRecord - a planned registration with the operator and rows it belongs with
 * @property {PlannedOperator} operator
 * @property {PlannedRegistration} registration
 * @property {PlannedRegistrationRows} rows
 */

/**
 * @typedef {Object} LiveRegistration - a planned registration the service now holds
 * @property {PlannedRegistration} planned
 * @property {PlannedRegistrationRows} rows
 * @property {number} index - its position among the operator's registrations, as applied for
 * @property {number | undefined} accreditationIndex - likewise among its accreditations
 * @property {string} registrationId - the id the service gave it
 * @property {string | null} accreditationId
 * @property {string} regNumber
 * @property {string | undefined} accNumber
 * @property {UploadEvent[]} uploads - every upload executed so far, in order, as `uploadRows` reads them
 * @property {Map<string, LiveNote>} notes - by the plan's `prnId`
 */

/**
 * @typedef {Object} LiveNote - a planned note the service now holds
 * @property {string} prnPath - the note's path under the accreditation
 * @property {string | null} prnNumber - the number the service gave it on issue
 */

/**
 * @typedef {Object} LiveOperator - a planned operator the service now holds
 * @property {PlannedOperator} planned
 * @property {string} refNo
 * @property {number} orgId - the six-digit id the service assigned, which its numbers carry
 * @property {{userId: string} | null} user - the Defra ID user linked to it
 * @property {string} email
 * @property {Record<string, string | undefined>} authHeader
 * @property {number} signedInAt - simulated ms
 * @property {Map<string, LiveRegistration>} registrations - by planned id
 */

/**
 * @typedef {Object} Run
 * @property {Seeders} seeders
 * @property {() => number} now
 * @property {Map<string, PlannedRegistrationRecord>} planned - by planned registration id
 * @property {Map<string, LiveOperator>} operators - by planned operator id
 */

/**
 * The state a replay carries between events: which planned operators and
 * registrations the service now holds, and under what ids.
 *
 * @param {Object} options
 * @param {PlannedPopulation} options.population
 * @param {PlannedRows} options.rows
 * @param {Seeders} [options.seeders]
 * @param {() => number} [options.now]
 * @returns {Run}
 */
export function createRun({
  population,
  rows,
  seeders = liveSeeders,
  now = Date.now
}) {
  const rowsByRegistration = new Map(
    rows.registrations.map((planned) => [planned.registrationId, planned])
  )
  const planned = new Map()
  for (const operator of population.organisations) {
    for (const registration of operator.registrations) {
      const registrationRows = rowsByRegistration.get(registration.id)
      if (!registrationRows) {
        throw new Error(`No rows are planned for ${registration.id}`)
      }
      planned.set(registration.id, {
        operator,
        registration,
        rows: registrationRows
      })
    }
  }
  return { seeders, now, planned, operators: new Map() }
}

/**
 * @param {Run} run
 * @param {{registrationId: string}} event
 * @returns {PlannedRegistrationRecord}
 */
function plannedOf(run, { registrationId }) {
  const record = run.planned.get(registrationId)
  if (!record) {
    throw new Error(`${registrationId} is not a planned registration`)
  }
  return record
}

/**
 * @param {Run} run
 * @param {{registrationId: string, organisationId: string}} event
 * @returns {{operator: LiveOperator, registration: LiveRegistration}}
 */
function liveOf(run, { organisationId, registrationId }) {
  const operator = run.operators.get(organisationId)
  const registration = operator?.registrations.get(registrationId)
  if (!operator || !registration) {
    throw new Error(`${registrationId} has not been approved yet`)
  }
  return { operator, registration }
}

/**
 * The operator as the service holds it, applied for with every registration
 * the population gave it the first time one of them is approved.
 *
 * @param {Run} run
 * @param {PlannedOperator} operator
 * @returns {Promise<LiveOperator>}
 */
async function liveOperator(run, operator) {
  const existing = run.operators.get(operator.id)
  if (existing) return existing

  const org = await run.seeders.createLinkedOrganisation(
    operator.registrations.map(applicationRow)
  )
  /** @type {LiveOperator} */
  const live = {
    planned: operator,
    refNo: org.refNo,
    orgId: org.orgId,
    user: null,
    email: '',
    authHeader: {},
    signedInAt: -Infinity,
    registrations: new Map()
  }
  run.operators.set(operator.id, live)
  return live
}

/**
 * @param {Run} run
 * @param {LiveOperator} operator
 * @returns {Promise<Record<string, string | undefined>>}
 */
async function signedIn(run, operator) {
  if (!operator.user) {
    throw new Error(`${operator.planned.id} has no Defra ID user to sign in`)
  }
  if (run.now() - operator.signedInAt < TOKEN_LIFETIME_MS - TOKEN_MARGIN_MS) {
    return operator.authHeader
  }
  operator.authHeader = await run.seeders.signInDefraIdUser(
    operator.user.userId,
    operator.email
  )
  operator.signedInAt = run.now()
  return operator.authHeader
}

/**
 * @param {Run} run
 * @param {RegistrationEvent} event
 */
async function approveRegistration(run, event) {
  const { operator, registration, rows } = plannedOf(run, event)
  const live = await liveOperator(run, operator)

  const index = operator.registrations.indexOf(registration)
  const accreditationIndex = registration.accreditation
    ? operator.registrations
        .slice(0, index)
        .filter((earlier) => earlier.accreditation).length
    : undefined
  const numbers = numbersFor(registration, {
    orgId: live.orgId,
    serial: index + 1
  })

  const granted = await run.seeders.approveMigratedRegistration(
    live.refNo,
    { registrationIndex: index, accreditationIndex },
    {
      ...numbers,
      reprocessingType: reprocessingTypeOf(rows.stream),
      validFrom: registration.activeFrom,
      validTo: registration.accreditation?.validTo,
      submittedToRegulator: regulatorOf(operator)
    }
  )

  if (!live.user) {
    live.user = await run.seeders.createAndRegisterDefraIdUser(granted.email)
    live.email = granted.email
    live.authHeader = await run.seeders.linkDefraIdUser(
      live.refNo,
      live.user.userId,
      granted.email
    )
    live.signedInAt = run.now()
  }

  live.registrations.set(registration.id, {
    planned: registration,
    rows,
    index,
    accreditationIndex,
    registrationId: granted.registrationId,
    accreditationId: granted.accreditationId,
    ...numbers,
    uploads: [],
    notes: new Map()
  })

  // An exported row names an overseas site, and the service excludes the row
  // from the waste balance where the registration has no such site.
  if (rows.overseasSite) {
    await run.seeders.seedOverseasSites(
      live.refNo,
      [index],
      [rows.overseasSite.id],
      rows.overseasSite.validFrom
    )
  }

  return granted
}

/**
 * @param {{registration?: string, accreditation?: string}} statuses
 * @returns {(run: Run, event: RegistrationEvent) => Promise<void>}
 */
const changeStatus = (statuses) => async (run, event) => {
  const { operator, registration } = liveOf(run, event)
  await run.seeders.changeMigratedStatus(
    operator.refNo,
    {
      registrationIndex: registration.index,
      accreditationIndex: registration.accreditationIndex
    },
    statuses
  )
}

/** The code the service gives each kind of issue the plan can plant. */
const ISSUE_CODE = {
  [ISSUE_KIND.BLANK_FIELD]: 'FIELD_REQUIRED',
  [ISSUE_KIND.BAD_DATE]: 'INVALID_DATE',
  [ISSUE_KIND.UNREADABLE]: 'SPREADSHEET_MALFORMED_MARKERS',
  [ISSUE_KIND.REMOVED_ROW]: 'SEQUENTIAL_ROW_REMOVED'
}

/** The statuses validation ends in. */
const VALIDATED = ['validated', 'invalid']

/**
 * The status the service should leave an upload in, and the issue it should
 * report, given what the plan says became of it. An upload rejected for an
 * error on a row still validates; it is the operator who does not submit it.
 *
 * @param {UploadEvent} upload
 * @returns {{status: 'validated' | 'invalid', issue: ValidationIssue | null}}
 */
export function expectedValidation(upload) {
  if (upload.outcome !== UPLOAD_OUTCOME.REJECTED || !upload.issues) {
    return { status: 'validated', issue: null }
  }
  const { severity, kind } = upload.issues
  return {
    status: severity === ISSUE_SEVERITY.FATAL ? 'invalid' : 'validated',
    issue: { severity, code: ISSUE_CODE[kind] }
  }
}

/**
 * @typedef {Object} ValidationIssue
 * @property {string} severity
 * @property {string} code
 */

/**
 * The validation a summary log's read returns: fatal issues as `failures`,
 * row issues under the table and row they sit on.
 *
 * @typedef {Object} ReportedValidation
 * @property {{code: string}[]} [failures]
 * @property {Record<string, {rows: {issues: {type: string, code: string}[]}[]}>} [concerns]
 */

/**
 * Every issue the service reported, fatal or on a row, with its severity.
 *
 * @param {ReportedValidation | undefined} validation
 * @returns {ValidationIssue[]}
 */
function reportedIssues(validation) {
  const fatal = (validation?.failures ?? []).map(({ code }) => ({
    severity: ISSUE_SEVERITY.FATAL,
    code
  }))
  const onRows = Object.values(validation?.concerns ?? {}).flatMap((table) =>
    table.rows.flatMap((row) =>
      row.issues.map(({ type, code }) => ({ severity: type, code }))
    )
  )
  return [...fatal, ...onRows]
}

/**
 * Stops the run where the service read an upload differently from the plan:
 * a different status, an issue other than the one planted, or any issue
 * where none was.
 *
 * @param {UploadEvent} upload
 * @param {{status: string, validation?: ReportedValidation}} summaryLog
 */
function assertValidatedAsPlanned(upload, summaryLog) {
  const expected = expectedValidation(upload)
  const issues = reportedIssues(summaryLog.validation)
  const asPlanned =
    summaryLog.status === expected.status &&
    (expected.issue
      ? issues.some(
          (issue) =>
            issue.code === expected.issue?.code &&
            issue.severity === expected.issue?.severity
        )
      : !issues.some((issue) => issue.severity !== 'warning'))
  if (!asPlanned) {
    throw new Error(
      `${upload.registrationId}'s upload of ${upload.cutoff} was planned ${upload.outcome}` +
        `${upload.issues ? ` with ${upload.issues.severity} ${upload.issues.kind}` : ''}` +
        ` but came back ${summaryLog.status} with ${JSON.stringify(
          issues.map(({ severity, code }) => `${severity} ${code}`)
        )}`
    )
  }
}

/**
 * @param {Run} run
 * @param {UploadEvent} event
 */
async function uploadSummaryLog(run, event) {
  const { operator, registration } = liveOf(run, event)
  const { seeders } = run

  registration.uploads.push(event)
  const rows = uploadRows({
    registration: registration.rows,
    uploads: registration.uploads
  })
  const workbook = await seeders.generateSpreadsheetData({
    wasteProcessingType: registration.rows.stream,
    materialSuffix: registration.planned.material.suffix,
    nation: nationLetter(registration.planned.nation),
    orgId: operator.orgId,
    regNumber: registration.regNumber,
    accNumber: registration.accNumber,
    rows: rowsForUpload(rows),
    unreadable: event.issues?.kind === ISSUE_KIND.UNREADABLE,
    silentLogging: true
  })

  const authHeader = await signedIn(run, operator)
  const uploaded = await seeders.uploadSummaryLog(
    operator.refNo,
    registration.registrationId,
    authHeader,
    workbook
  )
  const summaryLog = await seeders.waitForSummaryLogStatus(
    uploaded.baseAPI,
    uploaded.summaryLogPath,
    authHeader,
    VALIDATED
  )
  assertValidatedAsPlanned(event, summaryLog)

  if (event.outcome === UPLOAD_OUTCOME.SUBMITTED) {
    await seeders.submitSummaryLog(
      uploaded.summaryLogPath,
      authHeader,
      uploaded.baseAPI
    )
  }

  return { summaryLogId: uploaded.summaryLogId, validation: summaryLog }
}

/**
 * What the operator types into a report beyond what the service aggregates
 * from the summary log: the tonnage a reprocessor recycled, which is what its
 * uploads credited over the period, and the figures the PRN executor is yet
 * to fill.
 *
 * @param {Pick<PlannedRegistration, 'processingType' | 'accreditation'>} registration
 * @param {PlannedLogRow[]} rows
 * @param {ReportEvent} report
 * @returns {{tonnageRecycled?: number, tonnageNotRecycled?: number, tonnageNotExported?: number, prnRevenue?: number, freeTonnage?: number}}
 */
export function reportFields(registration, rows, report) {
  const accredited = registration.accreditation !== null
  const prn = accredited ? { prnRevenue: 0, freeTonnage: 0 } : {}

  if (registration.processingType === 'exporter') {
    return accredited ? prn : { tonnageNotExported: 0 }
  }

  const periods = new Set(monthsOfPeriod(report))
  const recycled = rows
    .filter(
      (row) =>
        periods.has(row.period) && row.contribution === CONTRIBUTION.CREDIT
    )
    .reduce((total, row) => total + row.tonnage, 0)
  return {
    tonnageRecycled: heldTonnage(recycled),
    tonnageNotRecycled: 0,
    ...prn
  }
}

/**
 * @param {Run} run
 * @param {ReportEvent} event
 */
async function submitReport(run, event) {
  const { operator, registration } = liveOf(run, event)
  const authHeader = await signedIn(run, operator)
  const { year, cadence, period, submissionNumber } = event

  await run.seeders.seedReportSubmission(
    operator.refNo,
    registration.registrationId,
    authHeader,
    { year, cadence, period, submissionNumber },
    reportFields(registration.planned, registration.rows.rows, event)
  )
}

/**
 * @param {Run} run
 * @param {PrnEvent} event
 */
async function draftNote(run, event) {
  const { operator, registration } = liveOf(run, event)
  const { accreditationId } = registration
  if (!accreditationId) {
    throw new Error(
      `${event.registrationId} is not accredited, so cannot draft a note`
    )
  }
  const authHeader = await signedIn(run, operator)
  const balance = await run.seeders.waitForWasteBalance(
    operator.refNo,
    accreditationId,
    authHeader
  )
  const available = Number(balance[accreditationId].availableAmount)
  const tonnage = Math.floor(available * NOTE_SHARE_OF_AVAILABLE)
  if (tonnage < 1) {
    throw new Error(
      `${event.registrationId} has ${available} t available, too little to draft ${event.prnId}`
    )
  }
  const { prnPath } = await run.seeders.createPrn(
    operator.refNo,
    registration.registrationId,
    accreditationId,
    authHeader,
    tonnage
  )
  registration.notes.set(event.prnId, { prnPath, prnNumber: null })
}

/**
 * @param {Run} run
 * @param {PrnEvent} event
 * @returns {{operator: LiveOperator, note: LiveNote}}
 */
function liveNote(run, event) {
  const { operator, registration } = liveOf(run, event)
  const note = registration.notes.get(event.prnId)
  if (!note) {
    throw new Error(`${event.prnId} has not been drafted`)
  }
  return { operator, note }
}

/**
 * Moves a note to the status the operator or signatory takes it to, keeping
 * the number the service gives it on issue.
 *
 * @param {string} status
 * @returns {(run: Run, event: PrnEvent) => Promise<void>}
 */
const moveNote = (status) => async (run, event) => {
  const { operator, note } = liveNote(run, event)
  const authHeader = await signedIn(run, operator)
  const moved = await run.seeders.updatePrnStatus(
    note.prnPath,
    authHeader,
    status
  )
  note.prnNumber = moved.prnNumber ?? note.prnNumber
}

/**
 * What the producer does through the external API, under the number the
 * service gave the note on issue.
 *
 * @param {(prnDetails: {prnNumber: string}) => Promise<void>} act
 * @returns {(run: Run, event: PrnEvent) => Promise<void>}
 */
const producerActs = (act) => async (run, event) => {
  const { note } = liveNote(run, event)
  if (!note.prnNumber) {
    throw new Error(`${event.prnId} has not been issued`)
  }
  await act({ prnNumber: note.prnNumber })
}

const discardNote = moveNote('discarded')
const raiseNote = moveNote('awaiting_authorisation')
const deleteNote = moveNote('deleted')
const issueNote = moveNote('awaiting_acceptance')
const cancelNote = moveNote('cancelled')

const suspendAccreditation = changeStatus({ accreditation: 'suspended' })
// The service cancels an approved accreditation only by cascade from its
// registration.
const cancelAccreditation = changeStatus({ registration: 'cancelled' })

/**
 * Carries out one event. Resolves to whatever the service handed back that a
 * later event might want. An event with no executor here stops the run.
 *
 * @param {Run} run
 * @param {CalendarEvent} event
 */
export async function executeEvent(run, event) {
  switch (event.type) {
    case EVENT.REGISTRATION_APPROVED:
      return approveRegistration(run, event)
    case EVENT.ACCREDITATION_SUSPENDED:
      return suspendAccreditation(run, event)
    case EVENT.ACCREDITATION_CANCELLED:
      return cancelAccreditation(run, event)
    case EVENT.SUMMARY_LOG_UPLOADED:
      return uploadSummaryLog(run, event)
    case EVENT.REPORT_SUBMITTED:
      return submitReport(run, event)
    case EVENT.PRN_DRAFTED:
      return draftNote(run, event)
    case EVENT.PRN_DISCARDED:
      return discardNote(run, event)
    case EVENT.PRN_RAISED:
      return raiseNote(run, event)
    case EVENT.PRN_DELETED:
      return deleteNote(run, event)
    case EVENT.PRN_ISSUED:
      return issueNote(run, event)
    case EVENT.PRN_ACCEPTED:
      return producerActs(run.seeders.externalAPIAcceptPrn)(run, event)
    case EVENT.PRN_CANCELLATION_REQUESTED:
      return producerActs(run.seeders.externalAPICancelPrn)(run, event)
    case EVENT.PRN_CANCELLED:
      return cancelNote(run, event)
    default:
      throw new Error(
        `No executor carries out a ${/** @type {CalendarEvent} */ (event).type} event`
      )
  }
}
