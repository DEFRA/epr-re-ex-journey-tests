import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'

import { uploadRows } from '../calendar/calendar.js'
import {
  EVENT,
  ISSUE_KIND,
  ISSUE_SEVERITY,
  UPLOAD_OUTCOME
} from '../calendar/events.js'
import { planPopulation } from '../population/population.js'
import {
  CONTRIBUTION,
  planSummaryLogRows,
  rowsForUpload
} from '../rows/rows.js'
import {
  createRun,
  executeEvent,
  expectedValidation,
  reportFields
} from './execute.js'
import { nationLetter } from './join.js'

/** @import {PlannedRegistration} from '../population/population.js' */
/** @import {UploadEvent, ReportEvent} from '../calendar/events.js' */

const population = planPopulation({ seed: 'execute', scale: 0.1 })
const rows = planSummaryLogRows({ population })

/**
 * @template T
 * @param {T | undefined} value
 * @returns {T}
 */
const must = (value) => {
  assert.ok(value !== undefined)
  return value
}

const registrations = population.organisations.flatMap(
  (operator) => operator.registrations
)
/** @param {(registration: PlannedRegistration) => boolean} where */
const someRegistration = (where) => must(registrations.find(where))

const exporter = someRegistration(
  (registration) =>
    registration.processingType === 'exporter' &&
    registration.accreditation !== null
)
const reprocessor = someRegistration(
  (registration) =>
    registration.processingType === 'reprocessor' &&
    registration.accreditation !== null &&
    registration.activeFrom === '2026-01-01'
)
const registeredOnly = someRegistration(
  (registration) => registration.accreditation === null
)
const operatorOf = (registration) =>
  must(
    population.organisations.find(
      (operator) => operator.id === registration.organisationId
    )
  )
const rowsOf = (registration) =>
  must(
    rows.registrations.find(
      (planned) => planned.registrationId === registration.id
    )
  )

const HOUR = 60 * 60 * 1000

/**
 * Seeders that record what they were asked and answer as the service would,
 * so a test can read the sequence of calls an event turned into.
 */
function recordingSeeders() {
  /** @type {{name: string, args: unknown[]}[]} */
  const calls = []
  let organisations = 0
  let signIns = 0
  const record =
    (name, answer) =>
    (...args) => {
      calls.push({ name, args })
      return Promise.resolve(answer(...args))
    }

  const seeders = {
    calls,
    /** What the next validation wait reports back. */
    validation: { counts: { fatal: 0, error: 0, warning: 0, total: 0 } },
    of: (name) => calls.filter((call) => call.name === name),
    createLinkedOrganisation: record('createLinkedOrganisation', () => {
      organisations += 1
      return { refNo: `org-${organisations}`, orgId: 500000 + organisations }
    }),
    approveMigratedRegistration: record(
      'approveMigratedRegistration',
      (refNo, { registrationIndex, accreditationIndex }) => ({
        registrationId: `${refNo}-reg-${registrationIndex}`,
        accreditationId:
          accreditationIndex === undefined
            ? null
            : `${refNo}-acc-${accreditationIndex}`,
        email: `${refNo}@example.com`
      })
    ),
    changeMigratedStatus: record('changeMigratedStatus', () => undefined),
    seedOverseasSites: record('seedOverseasSites', () => undefined),
    createAndRegisterDefraIdUser: record(
      'createAndRegisterDefraIdUser',
      (email) => ({ userId: `user-for-${email}` })
    ),
    linkDefraIdUser: record('linkDefraIdUser', () => ({
      Authorization: 'Bearer linked'
    })),
    signInDefraIdUser: record('signInDefraIdUser', () => {
      signIns += 1
      return { Authorization: `Bearer sign-in-${signIns}` }
    }),
    generateSpreadsheetData: record(
      'generateSpreadsheetData',
      () => 'data/workbook.xlsx'
    ),
    uploadSummaryLog: record('uploadSummaryLog', () => ({
      summaryLogId: 'log-1',
      summaryLogPath: '/summary-logs/log-1',
      baseAPI: {}
    })),
    waitForSummaryLogStatus: record(
      'waitForSummaryLogStatus',
      (baseAPI, path, auth, status) => ({
        status,
        validation: seeders.validation
      })
    ),
    submitSummaryLog: record('submitSummaryLog', () => ({
      status: 'submitted'
    })),
    seedReportSubmission: record('seedReportSubmission', () => undefined)
  }
  return seeders
}

/** @param {PlannedRegistration} registration */
const approved = (registration, at = `${registration.activeFrom}T09:00:00Z`) =>
  /** @type {const} */ ({
    type: EVENT.REGISTRATION_APPROVED,
    at,
    organisationId: registration.organisationId,
    registrationId: registration.id
  })

/**
 * @param {PlannedRegistration} registration
 * @param {Partial<UploadEvent>} overrides
 * @returns {UploadEvent}
 */
const uploaded = (registration, overrides = {}) => ({
  type: EVENT.SUMMARY_LOG_UPLOADED,
  at: '2026-02-03T10:00:00Z',
  organisationId: registration.organisationId,
  registrationId: registration.id,
  cutoff: '2026-02-02',
  outcome: UPLOAD_OUTCOME.SUBMITTED,
  issues: null,
  amendments: null,
  restated: [],
  closedPeriods: [],
  ...overrides
})

/**
 * @param {PlannedRegistration} registration
 * @param {Partial<ReportEvent>} overrides
 * @returns {ReportEvent}
 */
const reported = (registration, overrides = {}) => ({
  type: EVENT.REPORT_SUBMITTED,
  at: '2026-02-20T10:00:00Z',
  organisationId: registration.organisationId,
  registrationId: registration.id,
  year: 2026,
  cadence: 'monthly',
  period: 1,
  submissionNumber: 1,
  ...overrides
})

describe('a run', () => {
  let seeders
  let clock
  let run

  beforeEach(() => {
    seeders = recordingSeeders()
    clock = Date.parse('2026-01-05T09:00:00Z')
    run = createRun({ population, rows, seeders, now: () => clock })
  })

  describe('approving a registration', () => {
    it('applies for the operator with every registration it plans, once', async () => {
      const operator = operatorOf(exporter)
      for (const registration of operator.registrations) {
        await executeEvent(run, approved(registration))
      }

      const applications = seeders.of('createLinkedOrganisation')
      assert.equal(applications.length, 1)
      assert.equal(
        applications[0].args[0].length,
        operator.registrations.length
      )
    })

    it('approves the registration at its position with numbers built on the org id the service gave', async () => {
      const operator = operatorOf(exporter)
      const index = operator.registrations.indexOf(exporter)
      await executeEvent(run, approved(exporter))

      const [approval] = seeders.of('approveMigratedRegistration')
      const [refNo, indices, granted] = approval.args
      assert.equal(refNo, 'org-1')
      assert.equal(indices.registrationIndex, index)
      assert.match(granted.regNumber, /^R26[EWSN]X500001\d{4}[A-Z]{2}$/)
      assert.equal(
        granted.regNumber.slice(11, 15),
        String(index + 1).padStart(4, '0')
      )
      assert.equal(granted.accNumber, `A${granted.regNumber.slice(1)}`)
      assert.equal(granted.reprocessingType, undefined)
      assert.equal(granted.validFrom, exporter.activeFrom)
      assert.equal(granted.validTo, exporter.accreditation?.validTo)
      assert.equal(granted.submittedToRegulator, operator.agency.toLowerCase())
    })

    it('declares input or output for a reprocessor from the stream it files on', async () => {
      await executeEvent(run, approved(reprocessor))

      const [, , granted] = seeders.of('approveMigratedRegistration')[0].args
      assert.equal(
        granted.reprocessingType,
        rowsOf(reprocessor).stream === 'reprocessorOutput' ? 'output' : 'input'
      )
    })

    it('links one Defra ID user to the operator, on the initial user email the service holds', async () => {
      const operator = operatorOf(exporter)
      for (const registration of operator.registrations) {
        await executeEvent(run, approved(registration))
      }

      const registered = seeders.of('createAndRegisterDefraIdUser')
      const linked = seeders.of('linkDefraIdUser')
      assert.equal(registered.length, 1)
      assert.deepEqual(registered[0].args, ['org-1@example.com'])
      assert.deepEqual(linked[0].args, [
        'org-1',
        'user-for-org-1@example.com',
        'org-1@example.com'
      ])
    })

    it('registers the overseas site an exporter names before its rows can count', async () => {
      const operator = operatorOf(exporter)
      await executeEvent(run, approved(exporter))

      const [seeded] = seeders.of('seedOverseasSites')
      const overseasSite = must(rowsOf(exporter).overseasSite ?? undefined)
      assert.deepEqual(seeded.args, [
        'org-1',
        [operator.registrations.indexOf(exporter)],
        [overseasSite.id],
        overseasSite.validFrom
      ])
    })

    it('registers no overseas site for a reprocessor', async () => {
      await executeEvent(run, approved(reprocessor))
      assert.equal(seeders.of('seedOverseasSites').length, 0)
    })
  })

  describe('changing an accreditation status', () => {
    it('suspends the accreditation', async () => {
      await executeEvent(run, approved(exporter))
      await executeEvent(run, {
        ...approved(exporter, '2026-04-07T11:00:00Z'),
        type: EVENT.ACCREDITATION_SUSPENDED
      })

      const [change] = seeders.of('changeMigratedStatus')
      assert.equal(change.args[0], 'org-1')
      assert.deepEqual(change.args[2], { accreditation: 'suspended' })
    })

    it('cancels the registration, which the service cascades to its accreditation', async () => {
      await executeEvent(run, approved(exporter))
      await executeEvent(run, {
        ...approved(exporter, '2026-05-01T11:00:00Z'),
        type: EVENT.ACCREDITATION_CANCELLED
      })

      const [change] = seeders.of('changeMigratedStatus')
      assert.deepEqual(change.args[2], { registration: 'cancelled' })
    })

    it('refuses an event for a registration not yet approved', async () => {
      await assert.rejects(
        executeEvent(run, {
          ...approved(exporter),
          type: EVENT.ACCREDITATION_SUSPENDED
        }),
        /not been approved/
      )
    })
  })

  describe('uploading a summary log', () => {
    it('renders the rows the plan gives this upload, on the registration as the service numbered it', async () => {
      await executeEvent(run, approved(exporter))
      const upload = uploaded(exporter)
      await executeEvent(run, upload)

      const [rendered] = seeders.of('generateSpreadsheetData')
      const [, , granted] = seeders.of('approveMigratedRegistration')[0].args
      const planned = rowsOf(exporter)
      assert.deepEqual(rendered.args[0], {
        wasteProcessingType: planned.stream,
        materialSuffix: exporter.material.suffix,
        nation: nationLetter(exporter.nation),
        orgId: 500001,
        regNumber: granted.regNumber,
        accNumber: granted.accNumber,
        rows: rowsForUpload(
          uploadRows({ registration: planned, uploads: [upload] })
        ),
        unreadable: false,
        silentLogging: true
      })

      const [sent] = seeders.of('uploadSummaryLog')
      assert.deepEqual(sent.args, [
        'org-1',
        'org-1-reg-' + operatorOf(exporter).registrations.indexOf(exporter),
        { Authorization: 'Bearer linked' },
        'data/workbook.xlsx'
      ])
    })

    it('lays every earlier submitted upload under the one it renders', async () => {
      await executeEvent(run, approved(exporter))
      const first = uploaded(exporter)
      const second = uploaded(exporter, {
        at: '2026-03-03T10:00:00Z',
        cutoff: '2026-03-02',
        amendments: { count: 2, seed: 'amend' }
      })
      await executeEvent(run, first)
      await executeEvent(run, second)

      const [, rendered] = seeders.of('generateSpreadsheetData')
      const planned = rowsOf(exporter)
      assert.deepEqual(
        rendered.args[0].rows,
        rowsForUpload(
          uploadRows({ registration: planned, uploads: [first, second] })
        )
      )
    })

    it('submits an upload the plan says was submitted, and only that', async () => {
      await executeEvent(run, approved(exporter))
      await executeEvent(run, uploaded(exporter))
      await executeEvent(
        run,
        uploaded(exporter, { outcome: UPLOAD_OUTCOME.ABANDONED })
      )

      const waits = seeders.of('waitForSummaryLogStatus')
      assert.deepEqual(
        waits.map((wait) => wait.args[3]),
        ['validated', 'validated']
      )
      assert.equal(seeders.of('submitSummaryLog').length, 1)
    })

    it('waits for a fatally rejected upload to come back invalid', async () => {
      await executeEvent(run, approved(exporter))
      seeders.validation = { counts: { fatal: 1, error: 0 } }
      await executeEvent(
        run,
        uploaded(exporter, {
          outcome: UPLOAD_OUTCOME.REJECTED,
          issues: {
            severity: ISSUE_SEVERITY.FATAL,
            kind: ISSUE_KIND.UNREADABLE,
            rows: []
          }
        })
      )

      const [wait] = seeders.of('waitForSummaryLogStatus')
      assert.equal(wait.args[3], 'invalid')
      assert.equal(
        seeders.of('generateSpreadsheetData')[0].args[0].unreadable,
        true
      )
      assert.equal(seeders.of('submitSummaryLog').length, 0)
    })

    it('stops when the service found errors the plan did not put there', async () => {
      await executeEvent(run, approved(exporter))
      seeders.validation = { counts: { fatal: 0, error: 3 } }

      await assert.rejects(
        executeEvent(run, uploaded(exporter)),
        /planned submitted but validated as validated with .*"error":3/
      )
    })

    it('stops when the service found none of the errors the plan put there', async () => {
      await executeEvent(run, approved(exporter))
      const planned = rowsOf(exporter)

      await assert.rejects(
        executeEvent(
          run,
          uploaded(exporter, {
            outcome: UPLOAD_OUTCOME.REJECTED,
            issues: {
              severity: ISSUE_SEVERITY.ERROR,
              kind: ISSUE_KIND.BLANK_FIELD,
              rows: [planned.rows[0]]
            }
          })
        ),
        /planned rejected with error blankField/
      )
    })

    it('signs the operator in again once a token has aged out', async () => {
      await executeEvent(run, approved(exporter))
      await executeEvent(run, uploaded(exporter))
      clock += 50 * 60 * 1000
      await executeEvent(run, uploaded(exporter))
      clock += HOUR
      await executeEvent(run, uploaded(exporter))

      const uploads = seeders.of('uploadSummaryLog')
      assert.deepEqual(
        uploads.map((upload) => upload.args[2].Authorization),
        ['Bearer linked', 'Bearer linked', 'Bearer sign-in-1']
      )
      assert.deepEqual(seeders.of('signInDefraIdUser')[0].args, [
        'user-for-org-1@example.com',
        'org-1@example.com'
      ])
    })
  })

  describe('submitting a report', () => {
    it('creates and submits the period as the operator', async () => {
      await executeEvent(run, approved(exporter))
      await executeEvent(run, reported(exporter))

      const [submission] = seeders.of('seedReportSubmission')
      assert.deepEqual(submission.args.slice(0, 4), [
        'org-1',
        'org-1-reg-' + operatorOf(exporter).registrations.indexOf(exporter),
        { Authorization: 'Bearer linked' },
        { year: 2026, cadence: 'monthly', period: 1, submissionNumber: 1 }
      ])
    })
  })

  describe('an event with no executor', () => {
    it('is refused by name', async () => {
      await assert.rejects(
        executeEvent(run, {
          type: EVENT.PRN_DRAFTED,
          at: '2026-02-03T10:00:00Z',
          organisationId: exporter.organisationId,
          registrationId: exporter.id,
          prnId: 'P1'
        }),
        /No executor carries out a prn.drafted event/
      )
    })
  })
})

describe('what an upload should come back as', () => {
  const rejected = (severity, kind) =>
    uploaded(exporter, {
      outcome: UPLOAD_OUTCOME.REJECTED,
      issues: { severity, kind, rows: [] }
    })

  it('is validated and clean when it lands or is abandoned', () => {
    assert.deepEqual(expectedValidation(uploaded(exporter)), {
      status: 'validated',
      findsIssues: false
    })
    assert.deepEqual(
      expectedValidation(
        uploaded(exporter, { outcome: UPLOAD_OUTCOME.ABANDONED })
      ),
      { status: 'validated', findsIssues: false }
    )
  })

  it('is invalid when rejected fatally', () => {
    assert.deepEqual(
      expectedValidation(rejected(ISSUE_SEVERITY.FATAL, ISSUE_KIND.BAD_DATE)),
      { status: 'invalid', findsIssues: true }
    )
  })

  it('is validated with errors on rows when rejected for one', () => {
    assert.deepEqual(
      expectedValidation(
        rejected(ISSUE_SEVERITY.ERROR, ISSUE_KIND.BLANK_FIELD)
      ),
      { status: 'validated', findsIssues: true }
    )
  })
})

describe('what the operator types into a report', () => {
  const january = reported(reprocessor)
  const firstQuarter = reported(registeredOnly, {
    cadence: 'quarterly',
    period: 1
  })

  it('is the tonnage a reprocessor credited over the period, and the PRN figures still to come', () => {
    const planned = rowsOf(reprocessor)
    const credited = planned.rows
      .filter(
        (row) =>
          row.period === '2026-01' && row.contribution === CONTRIBUTION.CREDIT
      )
      .reduce((total, row) => total + row.tonnage, 0)
    assert.ok(credited > 0)

    assert.deepEqual(reportFields(reprocessor, planned.rows, january), {
      tonnageRecycled: Math.round(credited * 100) / 100,
      tonnageNotRecycled: 0,
      prnRevenue: 0,
      freeTonnage: 0
    })
  })

  it('covers three months for a quarterly return', () => {
    const planned = rowsOf(reprocessor)
    const quarter = reported(reprocessor, { cadence: 'quarterly', period: 2 })
    const credited = planned.rows
      .filter(
        (row) =>
          ['2026-04', '2026-05', '2026-06'].includes(row.period) &&
          row.contribution === CONTRIBUTION.CREDIT
      )
      .reduce((total, row) => total + row.tonnage, 0)

    assert.equal(
      reportFields(reprocessor, planned.rows, quarter).tonnageRecycled,
      Math.round(credited * 100) / 100
    )
  })

  it('is only the PRN figures for an accredited exporter, whose export the service aggregates', () => {
    assert.deepEqual(reportFields(exporter, rowsOf(exporter).rows, january), {
      prnRevenue: 0,
      freeTonnage: 0
    })
  })

  it('has no PRN figures for a registered-only registration', () => {
    const fields = reportFields(
      registeredOnly,
      rowsOf(registeredOnly).rows,
      firstQuarter
    )
    assert.equal('prnRevenue' in fields, false)
    assert.equal('freeTonnage' in fields, false)
    if (registeredOnly.processingType === 'exporter') {
      assert.deepEqual(fields, { tonnageNotExported: 0 })
    } else {
      assert.deepEqual(fields, { tonnageRecycled: 0, tonnageNotRecycled: 0 })
    }
  })
})
