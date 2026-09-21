/**
 * Every kind of event the calendar plans, in the one place the executors
 * implement against. An executor that switches over `EVENT` and handles each
 * member has covered everything the calendar can hand it.
 *
 * Each event carries `type`, `at` (an ISO timestamp), `organisationId` and,
 * where it concerns one registration, `registrationId`. What else it carries is
 * given per type below.
 */

/**
 * @type {{
 *   REGISTRATION_APPROVED: 'registration.approved',
 *   ACCREDITATION_SUSPENDED: 'accreditation.suspended',
 *   ACCREDITATION_CANCELLED: 'accreditation.cancelled',
 *   SUMMARY_LOG_UPLOADED: 'summary-log.uploaded',
 *   REPORT_SUBMITTED: 'report.submitted',
 *   PRN_DRAFTED: 'prn.drafted',
 *   PRN_DISCARDED: 'prn.discarded',
 *   PRN_RAISED: 'prn.raised',
 *   PRN_DELETED: 'prn.deleted',
 *   PRN_ISSUED: 'prn.issued',
 *   PRN_ACCEPTED: 'prn.accepted',
 *   PRN_CANCELLATION_REQUESTED: 'prn.cancellation-requested',
 *   PRN_CANCELLED: 'prn.cancelled'
 * }}
 */
export const EVENT = {
  /** The registration, and the accreditation the population gave it, go live as planned there. */
  REGISTRATION_APPROVED: 'registration.approved',
  /** The regulator suspends the accreditation. It issues nothing from here, and still records loads and reports. */
  ACCREDITATION_SUSPENDED: 'accreditation.suspended',
  /** The regulator cancels the accreditation, and the registration with it: the register's cancelled rows are the same rows. */
  ACCREDITATION_CANCELLED: 'accreditation.cancelled',
  /** A summary log workbook is uploaded. See `UploadEvent` for what became of it. */
  SUMMARY_LOG_UPLOADED: 'summary-log.uploaded',
  /** A report for one reporting period is created and submitted. */
  REPORT_SUBMITTED: 'report.submitted',
  /** The operator saves a draft PRN or PERN. */
  PRN_DRAFTED: 'prn.drafted',
  /** The operator discards the draft. */
  PRN_DISCARDED: 'prn.discarded',
  /** The operator raises the draft for authorisation. */
  PRN_RAISED: 'prn.raised',
  /** The signatory deletes it instead of authorising. */
  PRN_DELETED: 'prn.deleted',
  /** The signatory authorises it, and it awaits the producer's acceptance. */
  PRN_ISSUED: 'prn.issued',
  /** The producer accepts it. */
  PRN_ACCEPTED: 'prn.accepted',
  /** The producer asks for it to be cancelled instead of accepting it. */
  PRN_CANCELLATION_REQUESTED: 'prn.cancellation-requested',
  /** The signatory confirms the cancellation. */
  PRN_CANCELLED: 'prn.cancelled'
}

/**
 * What became of a summary log upload.
 *
 * @type {{SUBMITTED: 'submitted', REJECTED: 'rejected', ABANDONED: 'abandoned'}}
 */
export const UPLOAD_OUTCOME = {
  /** Validated and submitted, so its rows are the registration's record. */
  SUBMITTED: 'submitted',
  /** Came back with validation issues and was not submitted. */
  REJECTED: 'rejected',
  /** Validated cleanly and left as a draft that was never submitted. */
  ABANDONED: 'abandoned'
}

/**
 * Why a rejected upload was rejected. Each is the plan of a workbook that
 * provokes one of the validation codes production sees.
 *
 * @type {{REMOVED_ROW: 'removedRow', UNREADABLE: 'unreadable', BAD_DATE: 'badDate', BLANK_FIELD: 'blankField'}}
 */
export const ISSUE_KIND = {
  /** Fatal: a row submitted before is missing from this upload. */
  REMOVED_ROW: 'removedRow',
  /** Fatal: the workbook cannot be read at all. */
  UNREADABLE: 'unreadable',
  /** Fatal: text where a row's date should be, which the service refuses the row for. */
  BAD_DATE: 'badDate',
  /** Error on a row: a required cell left blank. */
  BLANK_FIELD: 'blankField'
}

/** @type {{FATAL: 'fatal', ERROR: 'error'}} */
export const ISSUE_SEVERITY = { FATAL: 'fatal', ERROR: 'error' }

/**
 * Which kinds of issue each severity draws from.
 *
 * @type {{fatal: ('removedRow' | 'unreadable' | 'badDate')[], error: ('blankField')[]}}
 */
export const ISSUE_KINDS_BY_SEVERITY = {
  [ISSUE_SEVERITY.FATAL]: [
    ISSUE_KIND.REMOVED_ROW,
    ISSUE_KIND.UNREADABLE,
    ISSUE_KIND.BAD_DATE
  ],
  [ISSUE_SEVERITY.ERROR]: [ISSUE_KIND.BLANK_FIELD]
}

/** @type {{MONTHLY: 'monthly', QUARTERLY: 'quarterly'}} */
export const CADENCE = { MONTHLY: 'monthly', QUARTERLY: 'quarterly' }

/**
 * @typedef {Object} BaseEvent
 * @property {string} at - ISO timestamp
 * @property {string} organisationId
 */

/**
 * @typedef {BaseEvent & {
 *   type: 'registration.approved' | 'accreditation.suspended' | 'accreditation.cancelled',
 *   registrationId: string
 * }} RegistrationEvent
 */

/** @typedef {{worksheet: string, rowId: number}} RowRef */

/**
 * @typedef {Object} UploadIssues
 * @property {'fatal' | 'error'} severity
 * @property {'removedRow' | 'unreadable' | 'blankField' | 'badDate'} kind
 * @property {RowRef[]} rows - the rows the issue is planted on; empty for an unreadable workbook
 */

/**
 * @typedef {Object} Amendments - previously submitted rows this upload restates with changed cells
 * @property {number} count - how many, drawn from the rows in periods still open, by `seed`
 * @property {string} seed - draws which rows, and the new cells of each
 */

/**
 * A summary log upload is a view of the row plan: every row dated up to
 * `cutoff`, with the amendments of this and every earlier submitted upload laid
 * over them, and this upload's own issue planted on top. `uploadRows` in
 * `calendar.js` renders that view.
 *
 * @typedef {BaseEvent & {
 *   type: 'summary-log.uploaded',
 *   registrationId: string,
 *   cutoff: string,
 *   outcome: 'submitted' | 'rejected' | 'abandoned',
 *   issues: UploadIssues | null,
 *   amendments: Amendments | null,
 *   restated: RowRef[],
 *   closedPeriods: string[]
 * }} UploadEvent
 *   `cutoff` is the ISO date of the last day of loads the workbook carries.
 *   `restated` names rows in a period whose report was already submitted,
 *   which the service reads as a restatement of that period. `closedPeriods`
 *   lists those periods as `YYYY-MM`, so amendments are drawn from the rest.
 */

/**
 * @typedef {BaseEvent & {
 *   type: 'report.submitted',
 *   registrationId: string,
 *   year: number,
 *   cadence: 'monthly' | 'quarterly',
 *   period: number,
 *   submissionNumber: number,
 *   tonnageRecycled: number | null
 * }} ReportEvent
 *   `period` counts from 1 within the year, months or quarters by `cadence`.
 *   A `submissionNumber` above 1 is a resubmission of a closed period.
 *   `tonnageRecycled` is what a reprocessor enters on the report, in tonnes
 *   to two decimals; null on an exporter's, which reports no such figure.
 */

/**
 * @typedef {BaseEvent & {
 *   type: 'prn.drafted' | 'prn.discarded' | 'prn.raised' | 'prn.deleted' | 'prn.issued' | 'prn.accepted' | 'prn.cancellation-requested' | 'prn.cancelled',
 *   registrationId: string,
 *   prnId: string,
 *   tonnage: number,
 *   pricePerTonne: number
 * }} PrnEvent
 *   `prnId` ties the events of one note together; it is the plan's own
 *   identifier, not the number the service assigns. `tonnage` is whole
 *   tonnes, at least one, and every event of a note carries the same
 *   `tonnage` and `pricePerTonne`, in pounds.
 */

/** @typedef {RegistrationEvent | UploadEvent | ReportEvent | PrnEvent} CalendarEvent */

/**
 * An event as the calendar drafts it, before it is stamped with a time and an
 * operator. Distributes over the union, so each kind keeps its own fields.
 *
 * @template T
 * @typedef {T extends unknown ? Omit<T, 'at' | 'organisationId'> : never} Drafted
 */
