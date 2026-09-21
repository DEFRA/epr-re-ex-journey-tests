/**
 * What the service holds of a run, read through its APIs as the admin user
 * and put into the plan's own vocabulary: the register's material suffixes,
 * tonnage bands and agencies, and the planned ids the run holds them under.
 */

import { BaseAPI } from '../../../apis/base-api.js'
import { AuthClient } from '../../auth.js'
import { assertSuccessResponse } from '../../response-assertions.js'

/** @import {Run} from '../execute/execute.js' */

/**
 * The ids the summary needs of an operator the service holds.
 *
 * @typedef {{refNo: string, registrations: Iterable<{registrationId: string, planned: {id: string}}>}} HeldOperator
 */

/**
 * @typedef {Object} ServiceRegistration
 * @property {'exporter' | 'reprocessor'} processingType
 * @property {string} material - the register's suffix
 * @property {boolean} accredited
 * @property {string | null} sitePostcode - the postcode the service keys a reprocessing site on; null for an exporter
 */

/**
 * @typedef {Object} ServiceOrganisation
 * @property {'exporter' | 'reprocessor' | 'both'} type
 * @property {string} agency
 * @property {ServiceRegistration[]} registrations
 * @property {{status: string, tonnageBand: string}[]} accreditations
 */

/**
 * @typedef {Object} ServiceView
 * @property {ServiceOrganisation[]} organisations
 * @property {{registrationId: string, uploadedAt: string, status: string}[]} summaryLogs - by planned registration id
 * @property {string} feedYear - the year the report feed listed every period of; an earlier year's period is in it only where a report was submitted
 * @property {{registrationNumber: string, reportType: string, reportingPeriod: string, submittedDate: string | null, submissionNumber: number | null}[]} reports - one per period per registration, a blank one where nothing was submitted
 * @property {{accreditationNumber: string, createdAt: string}[]} notes - every note, by the accreditation it was drafted under
 * @property {{accreditationNumber: string, at: string, from: string, to: string}[]} noteTransitions - every status change the service recorded
 */

/**
 * The fields the summary reads off what the service returns.
 *
 * @typedef {Object} WireOrganisation
 * @property {string} submittedToRegulator
 * @property {{wasteProcessingType: 'exporter' | 'reprocessor', material: string, glassRecyclingProcess?: string[], accreditationId?: string, site?: {address: {postcode: string}}}[]} registrations
 * @property {{status: string, prnIssuance: {tonnageBand: string}}[]} accreditations
 *
 * @typedef {{summaryLogs: {uploadedAt: string, status: string}[]}} WireSummaryLogs
 *
 * @typedef {{reportSubmissions: {registrationNumber: string, reportType: string, reportingPeriod: string, submittedDate: string, submissionNumber: number | ''}[], generatedAt: string}} WireReportFeed
 *
 * @typedef {{items: {accreditationNumber: string, createdAt: string}[], hasMore: boolean, nextCursor?: string}} WireNotesPage
 *
 * @typedef {{systemLogs: {createdAt: string, context: {previous: {status: {currentStatus: string}}, next: {status: {currentStatus: string}, accreditation: {accreditationNumber: string}}}}[], hasNext: boolean, nextCursor?: string}} WireSystemLogsPage
 */

/** The service's stored material, with glass split by its process, to the register's suffix. */
const SUFFIX = new Map([
  ['aluminium', 'AL'],
  ['fibre', 'FB'],
  ['glass_re_melt', 'GR'],
  ['glass_other', 'GO'],
  ['paper', 'PA'],
  ['plastic', 'PL'],
  ['steel', 'ST'],
  ['wood', 'WO']
])

/** The service's stored tonnage band, as the register and the application form spell it. */
const TONNAGE_BAND = new Map([
  ['up_to_500', 'Up to 500 tonnes'],
  ['up_to_5000', 'Up to 5,000 tonnes'],
  ['up_to_10000', 'Up to 10,000 tonnes'],
  ['over_10000', 'Over 10,000 tonnes']
])

/**
 * @param {string} material
 * @param {string} [glassRecyclingProcess]
 */
function suffixOf(material, glassRecyclingProcess) {
  const suffix = SUFFIX.get(
    (material === 'glass' ? glassRecyclingProcess : material) ?? ''
  )
  if (!suffix) {
    throw new Error(
      `The service holds a material "${material}" the register has no suffix for`
    )
  }
  return suffix
}

/** How many notes and system logs one page asks for. */
const NOTES_PAGE = 1000
const SYSTEM_LOGS_PAGE = 200

const NOTE_STATUSES = [
  'draft',
  'awaiting_authorisation',
  'awaiting_acceptance',
  'accepted',
  'awaiting_cancellation',
  'cancelled',
  'deleted',
  'discarded'
]

/**
 * @param {Run} run - what the service holds, by the ids it gave
 * @returns {Promise<ServiceView>}
 */
export async function readServiceView(run) {
  const auth = new AuthClient()
  await auth.authenticate()
  const api = new BaseAPI()
  const held = [...run.operators.values()].map(({ refNo, registrations }) => ({
    refNo,
    registrations: registrations.values()
  }))
  return viewThrough(held, async (path) =>
    assertSuccessResponse(await api.get(path, auth.authHeader()), path)
  )
}

/**
 * @param {Iterable<HeldOperator>} operators - what the service holds, by the ids it gave
 * @param {(path: string) => Promise<any>} get - a GET of the service as the admin user, answered with its JSON body
 * @returns {Promise<ServiceView>}
 */
export async function viewThrough(operators, get) {
  const organisations = []
  const summaryLogs = []
  for (const operator of operators) {
    /** @type {WireOrganisation} */
    const organisation = await get(`/v1/organisations/${operator.refNo}`)
    organisations.push(organisationOf(organisation))
    for (const registration of operator.registrations) {
      /** @type {WireSummaryLogs} */
      const listed = await get(
        `/v1/organisations/${operator.refNo}/registrations/${registration.registrationId}/summary-logs`
      )
      summaryLogs.push(
        ...listed.summaryLogs.map(({ uploadedAt, status }) => ({
          registrationId: registration.planned.id,
          uploadedAt,
          status
        }))
      )
    }
  }

  /** @type {WireReportFeed} */
  const feed = await get('/v1/organisations/reports/submissions')
  const feedYear = feed.generatedAt.slice(0, 4)
  const reports = feed.reportSubmissions.map((row) => ({
    registrationNumber: row.registrationNumber,
    reportType: row.reportType,
    reportingPeriod: row.reportingPeriod,
    submittedDate: row.submittedDate || null,
    submissionNumber: row.submissionNumber === '' ? null : row.submissionNumber
  }))

  const notes = []
  for await (const page of pages(
    /** @returns {Promise<WireNotesPage>} */
    (cursor) =>
      get(
        `/v1/admin/packaging-recycling-notes?statuses=${NOTE_STATUSES.join(',')}&limit=${NOTES_PAGE}${cursor ? `&cursor=${cursor}` : ''}`
      ),
    (page) => (page.hasMore ? page.nextCursor : undefined)
  )) {
    notes.push(
      ...page.items.map((note) => ({
        accreditationNumber: note.accreditationNumber,
        createdAt: note.createdAt
      }))
    )
  }

  const noteTransitions = []
  for await (const page of pages(
    /** @returns {Promise<WireSystemLogsPage>} */
    (cursor) =>
      get(
        `/v1/system-logs/search?subCategory=packaging-recycling-notes&limit=${SYSTEM_LOGS_PAGE}${cursor ? `&cursor=${cursor}&direction=next` : ''}`
      ),
    (page) => (page.hasNext ? page.nextCursor : undefined)
  )) {
    noteTransitions.push(
      ...page.systemLogs.map(({ createdAt, context }) => ({
        accreditationNumber: context.next.accreditation.accreditationNumber,
        at: createdAt,
        from: context.previous.status.currentStatus,
        to: context.next.status.currentStatus
      }))
    )
  }

  return {
    organisations,
    summaryLogs,
    feedYear,
    reports,
    notes,
    noteTransitions
  }
}

/**
 * Every page of a cursor-paginated listing, first to last.
 *
 * @template T
 * @param {(cursor: string | undefined) => Promise<T>} fetch
 * @param {(page: T) => string | undefined} nextCursor - undefined on the last page
 */
async function* pages(fetch, nextCursor) {
  /** @type {string | undefined} */
  let cursor
  do {
    const page = await fetch(cursor)
    yield page
    cursor = nextCursor(page)
  } while (cursor)
}

/**
 * @param {WireOrganisation} organisation
 * @returns {ServiceOrganisation}
 */
function organisationOf(organisation) {
  const types = new Set(
    organisation.registrations.map(
      (registration) => registration.wasteProcessingType
    )
  )
  return {
    type: types.size === 2 ? 'both' : [...types][0],
    agency: organisation.submittedToRegulator.toUpperCase(),
    registrations: organisation.registrations.map((registration) => ({
      processingType: registration.wasteProcessingType,
      material: suffixOf(
        registration.material,
        registration.glassRecyclingProcess?.[0]
      ),
      accredited: Boolean(registration.accreditationId),
      sitePostcode: registration.site?.address.postcode ?? null
    })),
    accreditations: organisation.accreditations.map((accreditation) => ({
      status: accreditation.status,
      tonnageBand:
        TONNAGE_BAND.get(accreditation.prnIssuance.tonnageBand) ??
        accreditation.prnIssuance.tonnageBand
    }))
  }
}
