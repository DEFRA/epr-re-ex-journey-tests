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
/** @import {RegistrationEvent, UploadEvent, ReportEvent, PrnEvent} from '../calendar/events.js' */

const population = planPopulation({ seed: 'execute', scale: 0.1 })
const rows = planSummaryLogRows({ population })

/**
 * @template T
 * @param {T | undefined} value
 * @param {string} what - what the 'execute' seed was expected to plan
 * @returns {T}
 */
const must = (value, what) => {
  assert.ok(value !== undefined, `The population plans no ${what}`)
  return value
}

const registrations = population.organisations.flatMap(
  (operator) => operator.registrations
)
/**
 * @param {string} what
 * @param {(registration: PlannedRegistration) => boolean} where
 */
const someRegistration = (what, where) => must(registrations.find(where), what)

const exporter = someRegistration(
  'accredited exporter',
  (registration) =>
    registration.processingType === 'exporter' &&
    registration.accreditation !== null
)
const reprocessor = someRegistration(
  'accredited reprocessor active from January',
  (registration) =>
    registration.processingType === 'reprocessor' &&
    registration.accreditation !== null &&
    registration.activeFrom === '2026-01-01'
)
const registeredOnly = someRegistration(
  'registered-only registration',
  (registration) => registration.accreditation === null
)
/** @param {PlannedRegistration} registration */
const operatorOf = (registration) =>
  must(
    population.organisations.find(
      (operator) => operator.id === registration.organisationId
    ),
    `operator for ${registration.id}`
  )
/** @param {PlannedRegistration} registration */
const rowsOf = (registration) =>
  must(
    rows.registrations.find(
      (planned) => planned.registrationId === registration.id
    ),
    `rows for ${registration.id}`
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
  let notes = 0
  const record =
    (name, answer) =>
    (...args) => {
      calls.push({ name, args })
      return Promise.resolve(answer(...args))
    }

  const seeders = {
    calls,
    /** @type {{failures: {code: string}[], concerns: Record<string, {rows: {issues: {type: string, code: string}[]}[]}>}} what the next validation wait reports back */
    validation: { failures: [], concerns: {} },
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
    waitForSummaryLogStatus: record('waitForSummaryLogStatus', () => ({
      status: seeders.validation.failures.length > 0 ? 'invalid' : 'validated',
      validation: seeders.validation
    })),
    submitSummaryLog: record('submitSummaryLog', () => ({
      status: 'submitted'
    })),
    seedReportSubmission: record('seedReportSubmission', () => undefined),
    createPrn: record('createPrn', (refNo, registrationId, accreditationId) => {
      notes += 1
      return {
        prnId: `note-${notes}`,
        prnPath: `/organisations/${refNo}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes/note-${notes}`
      }
    }),
    updatePrnStatus: record('updatePrnStatus', (prnPath, auth, status) => ({
      prnNumber: status === 'awaiting_acceptance' ? 'SR00001' : undefined
    })),
    externalAPIAcceptPrn: record('externalAPIAcceptPrn', () => undefined),
    externalAPICancelPrn: record('externalAPICancelPrn', () => undefined)
  }
  return seeders
}

/**
 * @param {PlannedRegistration} registration
 * @returns {RegistrationEvent}
 */
const approved = (
  registration,
  at = `${registration.activeFrom}T09:00:00Z`
) => ({
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

/**
 * @param {PlannedRegistration} registration
 * @param {PrnEvent['type']} type
 * @param {string} [prnId]
 * @param {Partial<PrnEvent>} [overrides]
 * @returns {PrnEvent}
 */
const noted = (registration, type, prnId = 'P1', overrides = {}) => ({
  type,
  at: '2026-02-10T10:00:00Z',
  organisationId: registration.organisationId,
  registrationId: registration.id,
  prnId,
  tonnage: 33,
  pricePerTonne: 299,
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
      const overseasSite = must(
        rowsOf(exporter).overseasSite ?? undefined,
        `overseas site for ${exporter.id}`
      )
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

      assert.equal(seeders.of('waitForSummaryLogStatus').length, 2)
      assert.equal(seeders.of('submitSummaryLog').length, 1)
    })

    it('accepts a fatally rejected upload that comes back invalid for the planted reason', async () => {
      await executeEvent(run, approved(exporter))
      seeders.validation = {
        failures: [{ code: 'SPREADSHEET_MALFORMED_MARKERS' }],
        concerns: {}
      }
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
      assert.deepEqual(wait.args[3], ['validated', 'invalid'])
      assert.equal(
        seeders.of('generateSpreadsheetData')[0].args[0].unreadable,
        true
      )
      assert.equal(seeders.of('submitSummaryLog').length, 0)
    })

    it('stops when the service found errors the plan did not put there', async () => {
      await executeEvent(run, approved(exporter))
      seeders.validation = {
        failures: [],
        concerns: {
          RECEIVED_LOADS_FOR_EXPORT: {
            rows: [{ issues: [{ type: 'error', code: 'VALUE_OUT_OF_RANGE' }] }]
          }
        }
      }

      await assert.rejects(
        executeEvent(run, uploaded(exporter)),
        /planned submitted but came back validated with \["error VALUE_OUT_OF_RANGE"\]/
      )
    })

    it('stops when the service rejected a fatally planned upload for another reason', async () => {
      await executeEvent(run, approved(exporter))
      seeders.validation = {
        failures: [{ code: 'INVALID_DATE' }],
        concerns: {}
      }

      await assert.rejects(
        executeEvent(
          run,
          uploaded(exporter, {
            outcome: UPLOAD_OUTCOME.REJECTED,
            issues: {
              severity: ISSUE_SEVERITY.FATAL,
              kind: ISSUE_KIND.REMOVED_ROW,
              rows: [rowsOf(exporter).rows[0]]
            }
          })
        ),
        /planned rejected with fatal removedRow but came back invalid with \["fatal INVALID_DATE"\]/
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

    it('types the revenue of the notes issued in the period, and the tonnage of those issued for nothing', async () => {
      await executeEvent(run, approved(exporter))
      const issue = async (prnId, at, overrides) => {
        for (const type of [
          EVENT.PRN_DRAFTED,
          EVENT.PRN_RAISED,
          EVENT.PRN_ISSUED
        ]) {
          await executeEvent(
            run,
            noted(exporter, type, prnId, { at, ...overrides })
          )
        }
      }
      await issue('P1', '2026-01-12T10:00:00Z', {
        tonnage: 10,
        pricePerTonne: 299
      })
      await issue('P2', '2026-01-20T10:00:00Z', {
        tonnage: 5,
        pricePerTonne: 0
      })
      await issue('P3', '2026-02-02T10:00:00Z', {
        tonnage: 7,
        pricePerTonne: 299
      })
      await executeEvent(
        run,
        noted(exporter, EVENT.PRN_DRAFTED, 'P4', {
          at: '2026-01-25T10:00:00Z',
          tonnage: 3
        })
      )
      await executeEvent(run, reported(exporter))

      const [submission] = seeders.of('seedReportSubmission')
      assert.deepEqual(submission.args[4], { prnRevenue: 2990, freeTonnage: 5 })
    })
  })

  describe('a note', () => {
    /**
     * The ids the service granted the registration, as the run holds them.
     *
     * @param {PlannedRegistration} registration
     */
    const grantedTo = (registration) => {
      const live = run.operators
        .get(registration.organisationId)
        ?.registrations.get(registration.id)
      return must(live, `live ${registration.id}`)
    }
    /** @param {PlannedRegistration} registration */
    const notePath = (registration) =>
      `/organisations/org-1/registrations/${grantedTo(registration).registrationId}/accreditations/${grantedTo(registration).accreditationId}/packaging-recycling-notes/note-1`

    it('is drafted for the tonnage the plan gives it, as the operator', async () => {
      await executeEvent(run, approved(exporter))
      await executeEvent(
        run,
        noted(exporter, EVENT.PRN_DRAFTED, 'P1', { tonnage: 41 })
      )

      const { registrationId, accreditationId } = grantedTo(exporter)
      const [draft] = seeders.of('createPrn')
      assert.deepEqual(draft.args, [
        'org-1',
        registrationId,
        accreditationId,
        { Authorization: 'Bearer linked' },
        41
      ])
    })

    it('cannot be drafted by a registered-only registration', async () => {
      await executeEvent(run, approved(registeredOnly))
      await assert.rejects(
        executeEvent(run, noted(registeredOnly, EVENT.PRN_DRAFTED)),
        /not accredited/
      )
    })

    /** @type {[PrnEvent['type'], string][]} */
    const moves = [
      [EVENT.PRN_DISCARDED, 'discarded'],
      [EVENT.PRN_RAISED, 'awaiting_authorisation'],
      [EVENT.PRN_DELETED, 'deleted'],
      [EVENT.PRN_ISSUED, 'awaiting_acceptance'],
      [EVENT.PRN_CANCELLED, 'cancelled']
    ]
    for (const [type, status] of moves) {
      it(`moves to ${status} when ${type}`, async () => {
        await executeEvent(run, approved(exporter))
        await executeEvent(run, noted(exporter, EVENT.PRN_DRAFTED))
        await executeEvent(run, noted(exporter, type))

        const [move] = seeders.of('updatePrnStatus')
        assert.deepEqual(move.args, [
          notePath(exporter),
          { Authorization: 'Bearer linked' },
          status
        ])
      })
    }

    it('keeps each note apart by the plan id', async () => {
      await executeEvent(run, approved(exporter))
      await executeEvent(run, noted(exporter, EVENT.PRN_DRAFTED, 'P1'))
      await executeEvent(run, noted(exporter, EVENT.PRN_DRAFTED, 'P2'))
      await executeEvent(run, noted(exporter, EVENT.PRN_DISCARDED, 'P1'))

      const [move] = seeders.of('updatePrnStatus')
      assert.match(move.args[0], /note-1$/)
    })

    it('is accepted by the producer through the external API under the number the service issued it', async () => {
      await executeEvent(run, approved(exporter))
      await executeEvent(run, noted(exporter, EVENT.PRN_DRAFTED))
      await executeEvent(run, noted(exporter, EVENT.PRN_RAISED))
      await executeEvent(run, noted(exporter, EVENT.PRN_ISSUED))
      await executeEvent(run, noted(exporter, EVENT.PRN_ACCEPTED))

      const [accepted] = seeders.of('externalAPIAcceptPrn')
      assert.equal(accepted.args[0].prnNumber, 'SR00001')
    })

    it('has its cancellation requested by the producer through the external API', async () => {
      await executeEvent(run, approved(exporter))
      await executeEvent(run, noted(exporter, EVENT.PRN_DRAFTED))
      await executeEvent(run, noted(exporter, EVENT.PRN_RAISED))
      await executeEvent(run, noted(exporter, EVENT.PRN_ISSUED))
      await executeEvent(run, noted(exporter, EVENT.PRN_CANCELLATION_REQUESTED))

      const [requested] = seeders.of('externalAPICancelPrn')
      assert.equal(requested.args[0].prnNumber, 'SR00001')
    })

    it('cannot be accepted before it is issued', async () => {
      await executeEvent(run, approved(exporter))
      await executeEvent(run, noted(exporter, EVENT.PRN_DRAFTED))
      await assert.rejects(
        executeEvent(run, noted(exporter, EVENT.PRN_ACCEPTED)),
        /P1 has not been issued/
      )
    })

    it('cannot be moved before it is drafted', async () => {
      await executeEvent(run, approved(exporter))
      await assert.rejects(
        executeEvent(run, noted(exporter, EVENT.PRN_RAISED)),
        /P1 has not been drafted/
      )
    })
  })

  describe('an event with no executor', () => {
    it('is refused by name', async () => {
      await assert.rejects(
        executeEvent(run, {
          ...noted(exporter, EVENT.PRN_DRAFTED),
          // A type the calendar cannot emit, which is what the refusal is for.
          type: /** @type {any} */ ('prn.framed')
        }),
        /No executor carries out a prn.framed event/
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
      issue: null
    })
    assert.deepEqual(
      expectedValidation(
        uploaded(exporter, { outcome: UPLOAD_OUTCOME.ABANDONED })
      ),
      { status: 'validated', issue: null }
    )
  })

  it('is invalid with the planted code when rejected fatally', () => {
    assert.deepEqual(
      expectedValidation(rejected(ISSUE_SEVERITY.FATAL, ISSUE_KIND.BAD_DATE)),
      { status: 'invalid', issue: { severity: 'fatal', code: 'INVALID_DATE' } }
    )
    assert.equal(
      expectedValidation(rejected(ISSUE_SEVERITY.FATAL, ISSUE_KIND.UNREADABLE))
        .issue?.code,
      'SPREADSHEET_MALFORMED_MARKERS'
    )
    assert.equal(
      expectedValidation(rejected(ISSUE_SEVERITY.FATAL, ISSUE_KIND.REMOVED_ROW))
        .issue?.code,
      'SEQUENTIAL_ROW_REMOVED'
    )
  })

  it('is validated with the planted error when rejected for one on a row', () => {
    assert.deepEqual(
      expectedValidation(
        rejected(ISSUE_SEVERITY.ERROR, ISSUE_KIND.BLANK_FIELD)
      ),
      {
        status: 'validated',
        issue: { severity: 'error', code: 'FIELD_REQUIRED' }
      }
    )
  })
})

describe('what the operator types into a report', () => {
  const january = reported(reprocessor)
  const firstQuarter = reported(registeredOnly, {
    cadence: 'quarterly',
    period: 1
  })

  /** Notes as the run holds them: two issued in January, one for nothing, one in February and one never issued. */
  const notes = [
    { tonnage: 10, pricePerTonne: 299.5, issued: '2026-01-12T10:00:00Z' },
    { tonnage: 5, pricePerTonne: 0, issued: '2026-01-20T10:00:00Z' },
    { tonnage: 7, pricePerTonne: 299.5, issued: '2026-02-02T10:00:00Z' },
    { tonnage: 3, pricePerTonne: 299.5, issued: null }
  ]

  it('is the tonnage a reprocessor credited over the period, with the revenue and free tonnage of the notes issued in it', () => {
    const planned = rowsOf(reprocessor)
    const credited = planned.rows
      .filter(
        (row) =>
          row.period === '2026-01' && row.contribution === CONTRIBUTION.CREDIT
      )
      .reduce((total, row) => total + row.tonnage, 0)
    assert.ok(credited > 0)

    assert.deepEqual(reportFields(reprocessor, planned.rows, january, notes), {
      tonnageRecycled: Math.round(credited * 100) / 100,
      tonnageNotRecycled: 0,
      prnRevenue: 2995,
      freeTonnage: 5
    })
  })

  it('reads the PRN figures as zero revenue and no free tonnage where nothing was issued', () => {
    assert.deepEqual(
      reportFields(exporter, rowsOf(exporter).rows, january, []),
      {
        prnRevenue: 0,
        freeTonnage: 0
      }
    )
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
      reportFields(reprocessor, planned.rows, quarter, []).tonnageRecycled,
      Math.round(credited * 100) / 100
    )
  })

  it('is only the PRN figures for an accredited exporter, whose export the service aggregates', () => {
    assert.deepEqual(
      reportFields(exporter, rowsOf(exporter).rows, january, notes),
      { prnRevenue: 2995, freeTonnage: 5 }
    )
  })

  it('is the tonnage not exported, at zero, for a registered-only exporter', () => {
    assert.deepEqual(
      reportFields(
        { ...registeredOnly, processingType: 'exporter' },
        [],
        firstQuarter,
        []
      ),
      { tonnageNotExported: 0 }
    )
  })

  it('is the tonnage recycled, with no PRN figures, for a registered-only reprocessor', () => {
    assert.deepEqual(
      reportFields(
        { ...registeredOnly, processingType: 'reprocessor' },
        [],
        firstQuarter,
        []
      ),
      { tonnageRecycled: 0, tonnageNotRecycled: 0 }
    )
  })
})
