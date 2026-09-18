/**
 * A hand-written list of events for one exporter and one reprocessor, replayed
 * against the local stack under the simulated clock. Every event the executors
 * carry out is in it, and every way a summary log can come back, so it is the
 * check that they do against the service what the plan says.
 *
 * Bring the stack up on the clock (see ../clock/README.md), then:
 *
 *   npm run simulate:exercise
 *
 * SIMULATOR_SEED picks the population the two operators are drawn from.
 */

import { fileURLToPath } from 'node:url'

import logger from '../../logger.js'
import {
  EVENT,
  ISSUE_KIND,
  ISSUE_SEVERITY,
  UPLOAD_OUTCOME
} from '../calendar/events.js'
import { setSimulatedNow } from '../clock/simulated-clock.js'
import { planPopulation } from '../population/population.js'
import { CONTRIBUTION, planSummaryLogRows } from '../rows/rows.js'
import { createRun, executeEvent } from './execute.js'

/** @import {PlannedRegistration} from '../population/population.js' */
/** @import {PlannedLogRow, PlannedRegistrationRows} from '../rows/rows.js' */
/** @import {CalendarEvent, ReportEvent, RowRef, UploadEvent, UploadIssues} from '../calendar/events.js' */

/** How long every process on the clock takes to notice a jump. */
const CLOCK_SETTLE_MS = 500

const population = planPopulation({
  seed: process.env.SIMULATOR_SEED ?? 'hand-run',
  scale: 0.05
})
const rows = planSummaryLogRows({ population })

/**
 * @param {'exporter' | 'reprocessor'} processingType
 * @returns {{registration: PlannedRegistration, rows: PlannedRegistrationRows}}
 */
function accreditedFromJanuary(processingType) {
  for (const operator of population.organisations) {
    for (const registration of operator.registrations) {
      const planned = rows.registrations.find(
        (candidate) => candidate.registrationId === registration.id
      )
      if (
        planned &&
        registration.processingType === processingType &&
        registration.status === 'approved' &&
        registration.accreditation?.status === 'approved' &&
        registration.activeFrom === '2026-01-01'
      ) {
        return { registration, rows: planned }
      }
    }
  }
  throw new Error(
    `The population holds no accredited ${processingType} active from January`
  )
}

/**
 * @param {PlannedLogRow} row
 * @returns {RowRef}
 */
const ref = ({ worksheet, rowId }) => ({ worksheet, rowId })

/**
 * @param {PlannedRegistrationRows} planned
 * @param {(row: PlannedLogRow) => boolean} where
 * @returns {PlannedLogRow}
 */
function someRow(planned, where) {
  const row = planned.rows.find(
    (candidate) =>
      candidate.contribution === CONTRIBUTION.CREDIT && where(candidate)
  )
  if (!row) {
    throw new Error(`${planned.registrationId} plans no such row`)
  }
  return row
}

/**
 * Two months of one registration: approved on the first day of the year, its
 * January closed by an upload and a report, then a day of every kind of
 * rejection before a second upload lands, restating January so its report is
 * filed again, then February's report, then the status change.
 *
 * @param {PlannedRegistration} registration
 * @param {PlannedRegistrationRows} planned
 * @param {'accreditation.suspended' | 'accreditation.cancelled'} ending
 * @returns {CalendarEvent[]}
 */
function eventsFor(registration, planned, ending) {
  const { organisationId, id: registrationId } = registration
  const januaryRow = someRow(planned, (row) => row.period === '2026-01')
  const februaryRow = someRow(
    planned,
    (row) => row.period === '2026-02' && row.date > '2026-02-02'
  )

  /**
   * @param {string} at
   * @param {Partial<UploadEvent>} upload
   * @returns {UploadEvent}
   */
  const uploaded = (at, upload) => ({
    type: EVENT.SUMMARY_LOG_UPLOADED,
    at,
    organisationId,
    registrationId,
    cutoff: '2026-03-02',
    outcome: UPLOAD_OUTCOME.REJECTED,
    issues: null,
    amendments: null,
    restated: [],
    closedPeriods: ['2026-01'],
    ...upload
  })
  /**
   * @param {UploadIssues['severity']} severity
   * @param {UploadIssues['kind']} kind
   * @param {RowRef[]} planted
   * @returns {Partial<UploadEvent>}
   */
  const rejected = (severity, kind, planted) => ({
    outcome: UPLOAD_OUTCOME.REJECTED,
    issues: { severity, kind, rows: planted }
  })
  /**
   * @param {string} at
   * @param {number} period
   * @param {number} submissionNumber
   * @returns {ReportEvent}
   */
  const reported = (at, period, submissionNumber) => ({
    type: EVENT.REPORT_SUBMITTED,
    at,
    organisationId,
    registrationId,
    year: 2026,
    cadence: 'monthly',
    period,
    submissionNumber
  })

  return [
    {
      type: EVENT.REGISTRATION_APPROVED,
      at: '2026-01-01T09:00:00Z',
      organisationId,
      registrationId
    },
    uploaded('2026-02-03T10:00:00Z', {
      cutoff: '2026-02-02',
      outcome: UPLOAD_OUTCOME.SUBMITTED,
      closedPeriods: []
    }),
    reported('2026-02-20T10:00:00Z', 1, 1),
    uploaded('2026-03-03T10:00:00Z', {
      ...rejected(ISSUE_SEVERITY.ERROR, ISSUE_KIND.BLANK_FIELD, [
        ref(februaryRow)
      ])
    }),
    uploaded('2026-03-03T10:30:00Z', {
      ...rejected(ISSUE_SEVERITY.FATAL, ISSUE_KIND.BAD_DATE, [ref(februaryRow)])
    }),
    uploaded('2026-03-03T11:00:00Z', {
      ...rejected(ISSUE_SEVERITY.FATAL, ISSUE_KIND.UNREADABLE, [])
    }),
    uploaded('2026-03-03T11:30:00Z', {
      ...rejected(ISSUE_SEVERITY.FATAL, ISSUE_KIND.REMOVED_ROW, [
        ref(januaryRow)
      ])
    }),
    uploaded('2026-03-03T12:00:00Z', { outcome: UPLOAD_OUTCOME.ABANDONED }),
    uploaded('2026-03-03T12:30:00Z', {
      outcome: UPLOAD_OUTCOME.SUBMITTED,
      amendments: { count: 1, seed: `${registrationId}/amend` },
      restated: [ref(januaryRow)]
    }),
    reported('2026-03-05T10:00:00Z', 1, 2),
    reported('2026-03-20T10:00:00Z', 2, 1),
    { type: ending, at: '2026-04-01T09:00:00Z', organisationId, registrationId }
  ]
}

/** @param {Date | string} instant */
async function moveClockTo(instant) {
  setSimulatedNow(instant)
  await new Promise((resolve) => setTimeout(resolve, CLOCK_SETTLE_MS))
}

async function main() {
  const exporter = accreditedFromJanuary('exporter')
  const reprocessor = accreditedFromJanuary('reprocessor')
  logger.info(
    `Driving ${exporter.registration.id} (${exporter.rows.stream}) and ${reprocessor.registration.id} (${reprocessor.rows.stream})`
  )

  const events = [
    ...eventsFor(
      exporter.registration,
      exporter.rows,
      EVENT.ACCREDITATION_SUSPENDED
    ),
    ...eventsFor(
      reprocessor.registration,
      reprocessor.rows,
      EVENT.ACCREDITATION_CANCELLED
    )
  ].sort((a, b) => a.at.localeCompare(b.at))

  const run = createRun({ population, rows })
  for (const event of events) {
    await moveClockTo(event.at)
    const what =
      event.type === EVENT.SUMMARY_LOG_UPLOADED
        ? `${event.outcome}${event.issues ? ` (${event.issues.severity} ${event.issues.kind})` : ''}`
        : event.type === EVENT.REPORT_SUBMITTED
          ? `${event.year}/${event.period} submission ${event.submissionNumber}`
          : ''
    logger.info(`${event.at}  ${event.registrationId}  ${event.type}  ${what}`)
    await executeEvent(run, event)
  }

  for (const operator of run.operators.values()) {
    for (const registration of operator.registrations.values()) {
      logger.info(
        `${registration.planned.id} is ${operator.refNo}/${registration.registrationId} as ${registration.regNumber}` +
          (registration.accNumber ? ` and ${registration.accNumber}` : '')
      )
    }
  }
  logger.info(`Simulated now at the end: ${new Date().toISOString()}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    logger.error(error)
    process.exit(1)
  })
}
