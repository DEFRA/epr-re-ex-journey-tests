import { test } from '@playwright/test'
import { expect } from 'chai'
import {
  createAndRegisterDefraIdUser,
  linkDefraIdUser
} from '../support/defra-id-linking.js'
import {
  createLinkedOrganisation,
  updateMigratedOrganisation
} from '../support/seeding/organisation.js'
import {
  uploadSummaryLog,
  uploadAndValidateSummaryLog
} from '../support/seeding/summary-logs.js'
import { waitForSummaryLogStatus } from '../support/seeding/waiters.js'
import { defraIdStub } from '../support/defra-id-stub.js'
import {
  assertLoads,
  assertValidationConcerns,
  assertValidationFailures
} from '../support/summary-log-assertions.js'
import { generateSpreadsheetData } from '../support/spreadsheet/summarylogs-spreadsheet-data-generator.js'
import { WORKSHEET_CONFIG } from '../support/spreadsheet/spreadsheet-config.js'

/** @typedef {import('../support/spreadsheet/summarylogs-spreadsheet-data-generator.js').PlannedRow} PlannedRow */

// Proves the spreadsheet generator against the service it feeds: a workbook
// rendered from a planned row list validates clean on every stream, and each
// problem an operator hits in production comes back as its own named outcome.
// The generator's own rendering is covered by its unit tests; what only the
// service can answer is whether the service agrees.

const MATERIAL_SUFFIX = 'PA'
const VALID_FROM = '2025-02-02'

/** @type {Record<string, { wasteProcessingType: string, reprocessingType?: string, regNumber: string, accNumber?: string }>} */
const STREAMS = {
  exporter: {
    wasteProcessingType: 'Exporter',
    regNumber: 'R26EX5000000009PA',
    accNumber: 'A26EX5000000009PA'
  },
  reprocessorInput: {
    wasteProcessingType: 'Reprocessor',
    reprocessingType: 'input',
    regNumber: 'R26ER5000000009PA',
    accNumber: 'A26ER5000000009PA'
  },
  reprocessorOutput: {
    wasteProcessingType: 'Reprocessor',
    reprocessingType: 'output',
    regNumber: 'R26ER5000000008PA',
    accNumber: 'A26ER5000000008PA'
  },
  regOnlyExporter: {
    wasteProcessingType: 'Exporter',
    regNumber: 'R26EX5000000007PA'
  },
  regOnlyReprocessor: {
    wasteProcessingType: 'Reprocessor',
    reprocessingType: 'output',
    regNumber: 'R26ER5000000007PA'
  }
}

/** Seeds an organisation holding one registration of the given stream. */
async function seedRegistration(stream) {
  const withoutAccreditation = stream.accNumber === undefined
  const org = await createLinkedOrganisation([
    { wasteProcessingType: stream.wasteProcessingType, withoutAccreditation }
  ])
  const migrated = await updateMigratedOrganisation(org.refNo, [
    {
      ...(stream.reprocessingType
        ? { reprocessingType: stream.reprocessingType }
        : {}),
      regNumber: stream.regNumber,
      ...(stream.accNumber ? { accNumber: stream.accNumber } : {}),
      status: 'approved',
      validFrom: VALID_FROM,
      withoutAccreditation
    }
  ])
  const user = await createAndRegisterDefraIdUser(migrated.email)
  await linkDefraIdUser(org.refNo, user.userId, migrated.email)

  return {
    refNo: org.refNo,
    registrationId: migrated.registrationIds[0],
    authHeader: defraIdStub.authHeader(user.userId)
  }
}

/**
 * Plans `count` rows on every worksheet of a processing type, numbered from
 * each worksheet's own base, and returns both the plan and the row ids in it.
 *
 * @param {string} wasteProcessingType
 * @param {number} count
 * @returns {{ rows: Record<string, PlannedRow[]>, rowIds: string }}
 */
function planRows(wasteProcessingType, count) {
  /** @type {Record<string, PlannedRow[]>} */
  const rows = {}
  const ids = []
  for (const [worksheet, { rowId }] of Object.entries(
    WORKSHEET_CONFIG[wasteProcessingType]
  )) {
    rows[worksheet] = Array.from({ length: count }, (_, i) => ({
      rowId: rowId + i
    }))
    ids.push(...rows[worksheet].map((row) => row.rowId))
  }
  return { rows, rowIds: ids.join(',') }
}

// The only DATE_ field on each of the reprocessor input's worksheets. A row
// that has to render the same way twice pins its date, because a seed fixes
// the random draw but a date drawn relative to now still moves with the clock.
const REPROCESSOR_INPUT_DATE_FIELD = {
  'Received (sections 1, 2 and 3)': 'DATE_RECEIVED_FOR_REPROCESSING',
  'Reprocessed (section 4)': 'DATE_LOAD_LEFT_SITE',
  'Sent on (sections 5, 6 and 7)': 'DATE_LOAD_LEFT_SITE'
}

const RECEIVED_SHEET = 'Received (sections 1, 2 and 3)'
const PRN_ISSUED_FIELD = 'WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE'

/**
 * Pins fields on the one planned row carrying `rowId`, so a test states the
 * single thing it is changing about an otherwise ordinary plan.
 *
 * @param {Record<string, PlannedRow[]>} rows
 * @param {string} worksheet
 * @param {number} rowId
 * @param {Record<string, string | number>} fields
 * @returns {Record<string, PlannedRow[]>}
 */
function pinFields(rows, worksheet, rowId, fields) {
  return Object.fromEntries(
    Object.entries(rows).map(([name, plannedRows]) => [
      name,
      name === worksheet
        ? plannedRows.map((row) =>
            row.rowId === rowId
              ? { ...row, fields: { ...row.fields, ...fields } }
              : row
          )
        : plannedRows
    ])
  )
}

/**
 * A reprocessor input plan that renders identically every time: each row drawn
 * from a seed of its own row id, and dated to the given day. That is what lets
 * a later upload restate a row and have only the field the plan changed read
 * as an amendment.
 *
 * @param {number} count
 * @param {string} date
 * @param {string} prnIssued - the first received row's PRN answer, the one
 *   field a later upload changes to amend that row
 * @param {number} [omitRowId] - a row the plan leaves out, as an operator
 *   deleting a row they have already submitted
 * @returns {Record<string, PlannedRow[]>}
 */
function planStableRows(count, date, prnIssued, omitRowId) {
  const { rows } = planRows('reprocessorInput', count)
  return Object.fromEntries(
    Object.entries(rows).map(([worksheet, plannedRows]) => [
      worksheet,
      plannedRows
        .filter((row) => row.rowId !== omitRowId)
        .map((row, index) => ({
          ...row,
          seed: row.rowId,
          fields: {
            [REPROCESSOR_INPUT_DATE_FIELD[worksheet]]: date,
            ...(worksheet === RECEIVED_SHEET && index === 0
              ? { [PRN_ISSUED_FIELD]: prnIssued }
              : {})
          }
        }))
    ])
  )
}

function renderWorkbook(wasteProcessingType, stream, rows, extra = {}) {
  return generateSpreadsheetData({
    wasteProcessingType,
    materialSuffix: MATERIAL_SUFFIX,
    regNumber: stream.regNumber,
    accNumber: stream.accNumber,
    rows,
    silentLogging: true,
    ...extra
  })
}

test.describe('Summary Logs - workbooks rendered from a planned row list @summaryLogGeneratedRows', () => {
  for (const [wasteProcessingType, stream] of Object.entries(STREAMS)) {
    test(`validates clean for ${wasteProcessingType} @summaryLogGeneratedRowsValid`, async () => {
      test.setTimeout(120000)

      const { refNo, registrationId, authHeader } =
        await seedRegistration(stream)
      const { rows, rowIds } = planRows(wasteProcessingType, 3)
      const workbook = await renderWorkbook(wasteProcessingType, stream, rows)

      const { summaryLogPath, baseAPI } = await uploadAndValidateSummaryLog(
        refNo,
        registrationId,
        authHeader,
        workbook
      )
      const responseData = await waitForSummaryLogStatus(
        baseAPI,
        summaryLogPath,
        authHeader,
        'validated'
      )

      assertValidationFailures(responseData.validation.failures, [])
      assertLoads(responseData.loads, [
        { loadType: 'added.valid', count: rowIds.split(',').length, rowIds },
        { loadType: 'added.invalid', count: 0, rowIds: '' }
      ])
    })
  }

  test('reports a blank required field as a concern, leaving the rest valid @summaryLogGeneratedRowsFieldRequired', async () => {
    test.setTimeout(120000)

    const stream = STREAMS.reprocessorInput
    const { refNo, registrationId, authHeader } = await seedRegistration(stream)
    const rows = pinFields(
      planRows('reprocessorInput', 3).rows,
      RECEIVED_SHEET,
      1001,
      {
        EWC_CODE: ''
      }
    )

    const workbook = await renderWorkbook('reprocessorInput', stream, rows)
    const { summaryLogPath, baseAPI } = await uploadAndValidateSummaryLog(
      refNo,
      registrationId,
      authHeader,
      workbook
    )
    const responseData = await waitForSummaryLogStatus(
      baseAPI,
      summaryLogPath,
      authHeader,
      'validated'
    )

    assertValidationConcerns(
      responseData.validation.concerns,
      'RECEIVED_LOADS_FOR_REPROCESSING',
      5,
      [
        {
          type: 'error',
          code: 'FIELD_REQUIRED',
          header: 'EWC_CODE',
          column: 'H'
        }
      ]
    )
    assertLoads(responseData.loads, [
      { loadType: 'added.invalid', count: 1, rowIds: '1001' }
    ])
  })

  test('rejects the whole workbook over a bad date @summaryLogGeneratedRowsInvalidDate', async () => {
    test.setTimeout(120000)

    const stream = STREAMS.reprocessorInput
    const { refNo, registrationId, authHeader } = await seedRegistration(stream)
    const rows = pinFields(
      planRows('reprocessorInput', 3).rows,
      RECEIVED_SHEET,
      1002,
      { DATE_RECEIVED_FOR_REPROCESSING: 'TBC' }
    )

    const workbook = await renderWorkbook('reprocessorInput', stream, rows)
    const { summaryLogPath, baseAPI } = await uploadSummaryLog(
      refNo,
      registrationId,
      authHeader,
      workbook
    )
    const responseData = await waitForSummaryLogStatus(
      baseAPI,
      summaryLogPath,
      authHeader,
      'invalid'
    )

    assertValidationFailures(responseData.validation.failures, [
      {
        code: 'INVALID_DATE',
        sheet: 'Received (sections 1, 2 and 3)',
        table: 'RECEIVED_LOADS_FOR_REPROCESSING',
        rowId: 1002,
        row: 6,
        header: 'DATE_RECEIVED_FOR_REPROCESSING',
        actual: 'TBC'
      }
    ])
  })

  test('adjusts a restated row, then rejects an omitted one @summaryLogGeneratedRowsAmendAndRemove', async () => {
    test.setTimeout(180000)

    const stream = STREAMS.reprocessorInput
    const { refNo, registrationId, authHeader } = await seedRegistration(stream)

    const date = new Date().toLocaleDateString('en-GB')

    const first = planStableRows(3, date, 'No')
    const firstWorkbook = await renderWorkbook(
      'reprocessorInput',
      stream,
      first
    )
    const firstUpload = await uploadAndValidateSummaryLog(
      refNo,
      registrationId,
      authHeader,
      firstWorkbook
    )
    const firstSubmit = await firstUpload.baseAPI.post(
      `${firstUpload.summaryLogPath}/submit`,
      '',
      authHeader
    )
    expect(firstSubmit.statusCode).to.equal(200)
    await waitForSummaryLogStatus(
      firstUpload.baseAPI,
      firstUpload.summaryLogPath,
      authHeader,
      'submitted'
    )

    // The same row ids again, with one row's PRN answer changed: the service
    // reads a restated row id as an amendment of the load it already holds.
    const amended = planStableRows(3, date, 'Yes')
    const amendedWorkbook = await renderWorkbook(
      'reprocessorInput',
      stream,
      amended
    )
    const amendedUpload = await uploadAndValidateSummaryLog(
      refNo,
      registrationId,
      authHeader,
      amendedWorkbook
    )
    const amendedData = await waitForSummaryLogStatus(
      amendedUpload.baseAPI,
      amendedUpload.summaryLogPath,
      authHeader,
      'validated'
    )
    assertLoads(amendedData.loads, [
      { loadType: 'adjusted.valid', count: 1, rowIds: '1000' }
    ])

    const amendedSubmit = await amendedUpload.baseAPI.post(
      `${amendedUpload.summaryLogPath}/submit`,
      '',
      authHeader
    )
    expect(amendedSubmit.statusCode).to.equal(200)
    await waitForSummaryLogStatus(
      amendedUpload.baseAPI,
      amendedUpload.summaryLogPath,
      authHeader,
      'submitted'
    )

    // The same plan with one row dropped: a row id the operator has already
    // submitted cannot go away again.
    const shortened = planStableRows(3, date, 'Yes', 1001)
    const shortenedWorkbook = await renderWorkbook(
      'reprocessorInput',
      stream,
      shortened
    )
    const shortenedUpload = await uploadSummaryLog(
      refNo,
      registrationId,
      authHeader,
      shortenedWorkbook
    )
    const shortenedData = await waitForSummaryLogStatus(
      shortenedUpload.baseAPI,
      shortenedUpload.summaryLogPath,
      authHeader,
      'invalid'
    )
    assertValidationFailures(shortenedData.validation.failures, [
      {
        code: 'SEQUENTIAL_ROW_REMOVED',
        sheet: 'Received',
        table: 'RECEIVED_LOADS_FOR_REPROCESSING',
        rowId: 1001
      }
    ])
  })

  test('rejects a workbook it cannot read at all @summaryLogGeneratedRowsUnreadable', async () => {
    test.setTimeout(120000)

    const stream = STREAMS.reprocessorInput
    const { refNo, registrationId, authHeader } = await seedRegistration(stream)
    const { rows } = planRows('reprocessorInput', 3)

    const workbook = await renderWorkbook('reprocessorInput', stream, rows, {
      unreadable: true
    })
    const { summaryLogPath, baseAPI } = await uploadSummaryLog(
      refNo,
      registrationId,
      authHeader,
      workbook
    )
    const responseData = await waitForSummaryLogStatus(
      baseAPI,
      summaryLogPath,
      authHeader,
      'invalid'
    )

    assertValidationFailures(responseData.validation.failures, [
      { code: 'SPREADSHEET_MALFORMED_MARKERS' }
    ])
  })
})
