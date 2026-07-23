import { test } from '@playwright/test'
import { expect } from 'chai'
import {
  createAndRegisterDefraIdUser,
  createLinkedOrganisation,
  ingestSummaryLogFixture,
  linkDefraIdUser,
  updateMigratedOrganisation,
  waitForSummaryLogStatus,
  waitForWasteBalance
} from '../support/apicalls.js'
import { defraIdStub } from '../support/defra-id-stub.js'
import {
  assertLoads,
  assertReportingPeriodBucketRows,
  assertReportingPeriodLoads,
  assertValidationConcerns,
  assertValidationFailures
} from '../support/summary-log-assertions.js'
import {
  assertAuditLog,
  assertLogMessage
} from '../support/docker-log-assertions.js'

// Ported from epr-backend-journey-tests' summarylogs-reprocessor-input.feature.
// See summarylogs-validation.api.e2e.js for the shared floci-fixture-shortcut
// rationale and the loadsByWasteRecordType/DB-assertion gaps this repeats.
test.describe('Summary Logs - Reprocessor on Input @summaryLogReprocessorInput', () => {
  let orgId
  let registrationId
  let accreditationId
  let authHeader

  test.beforeAll(async () => {
    const org = await createLinkedOrganisation([
      { wasteProcessingType: 'Reprocessor' }
    ])
    const migrated = await updateMigratedOrganisation(org.refNo, [
      {
        reprocessingType: 'input',
        regNumber: 'R25SR500030912PA',
        accNumber: 'ACC123456',
        status: 'approved',
        validFrom: '2025-02-02'
      }
    ])
    const user = await createAndRegisterDefraIdUser(migrated.email)
    await linkDefraIdUser(org.refNo, user.userId, migrated.email)
    authHeader = defraIdStub.authHeader(user.userId)
    orgId = org.refNo
    registrationId = migrated.registrationIds[0]
    accreditationId = migrated.accreditationIds[0]
  })

  test('creates a Waste Record, then a second upload rejects a removed row, then adjustments update the balance @summaryLogReprocessorInputValidatedFlow', async () => {
    test.setTimeout(120000)

    const first = await ingestSummaryLogFixture(
      orgId,
      registrationId,
      authHeader,
      {
        s3Key: 'reprocessor-input-valid-key',
        filename: 'reprocessor-input-valid.xlsx'
      }
    )
    const firstData = await waitForSummaryLogStatus(
      first.baseAPI,
      first.summaryLogPath,
      authHeader,
      'validated'
    )

    assertValidationConcerns(
      firstData.validation.concerns,
      'RECEIVED_LOADS_FOR_REPROCESSING',
      6,
      [
        {
          type: 'error',
          code: 'FIELD_REQUIRED',
          header: 'EWC_CODE',
          column: 'H'
        }
      ]
    )

    assertLoads(firstData.loads, [
      { loadType: 'added.valid', count: 4, rowIds: '1000,1001,4000,5000' },
      { loadType: 'added.invalid', count: 1, rowIds: '1002' },
      { loadType: 'added.included', count: 3, rowIds: '1000,1001,5000' },
      { loadType: 'added.excluded', count: 1, rowIds: '1002' }
    ])

    assertReportingPeriodLoads(firstData.loadsByReportingPeriod, {
      'openPeriodLoads.added.balanceAffecting.count': 3,
      'openPeriodLoads.added.balanceAffecting.tonnageDelta': 361.62,
      'openPeriodLoads.added.nonBalanceAffecting.count': 2,
      'openPeriodLoads.adjusted.balanceAffecting.count': 0,
      'closedPeriodLoads.added.balanceAffecting.count': 0
    })

    // NOT covered: submitting this log while concurrently initiating a new
    // upload for the same registration (the source asserts both succeed) -
    // covered here as a plain sequential submit, since the concurrency
    // itself isn't this scenario's point (that's summarylogs-staleness's
    // job). Also NOT covered: the waste-records-created DB check and "no
    // expiry" DB check - no MongoDB client wired into this layer. The
    // structured log-message/audit-log assertions ARE covered below, via
    // `docker logs` against the local epr-backend container (see
    // docker-log-assertions.js) - they no-op against a deployed environment.
    const submitResponse = await first.baseAPI.post(
      `${first.summaryLogPath}/submit`,
      '',
      authHeader
    )
    expect(submitResponse.statusCode).to.equal(200)
    await waitForSummaryLogStatus(
      first.baseAPI,
      first.summaryLogPath,
      authHeader,
      'submitted'
    )

    await assertLogMessage({
      level: 'info',
      eventAction: 'process_success',
      message: `Summary log submitted: summaryLogId=${first.summaryLogId}`
    })
    await assertAuditLog({
      eventCategory: 'waste-reporting',
      eventAction: 'submit',
      contextKeys: ['summaryLogId', 'organisationId', 'registrationId'],
      count: 1,
      contextValues: [first.summaryLogId, orgId, registrationId]
    })

    const balanceAfterFirst = await waitForWasteBalance(
      orgId,
      accreditationId,
      authHeader
    )
    expect(parseFloat(balanceAfterFirst[accreditationId].amount)).to.equal(
      361.62
    )
    expect(
      parseFloat(balanceAfterFirst[accreditationId].availableAmount)
    ).to.equal(361.62)

    // Second upload: fails validation for a removed row. Depends on the
    // first upload's rows already being submitted.
    const second = await ingestSummaryLogFixture(
      orgId,
      registrationId,
      authHeader,
      {
        s3Key: 'valid-summary-log-input-2-key',
        filename: 'valid-summary-log-input-2.xlsx'
      }
    )
    const secondData = await waitForSummaryLogStatus(
      second.baseAPI,
      second.summaryLogPath,
      authHeader,
      'invalid'
    )
    assertValidationFailures(secondData.validation.failures, [
      {
        code: 'SEQUENTIAL_ROW_REMOVED',
        sheet: 'Received',
        table: 'RECEIVED_LOADS_FOR_REPROCESSING',
        rowId: 1001
      },
      {
        code: 'SEQUENTIAL_ROW_REMOVED',
        sheet: 'Received',
        table: 'RECEIVED_LOADS_FOR_REPROCESSING',
        rowId: 1002
      },
      {
        code: 'SEQUENTIAL_ROW_REMOVED',
        sheet: 'Processed',
        table: 'REPROCESSED_LOADS',
        rowId: 4000
      },
      {
        code: 'SEQUENTIAL_ROW_REMOVED',
        sheet: 'Sent on',
        table: 'SENT_ON_LOADS',
        rowId: 5000
      }
    ])
    const secondSubmitResponse = await second.baseAPI.post(
      `${second.summaryLogPath}/submit`,
      '',
      authHeader
    )
    expect(secondSubmitResponse.statusCode).to.equal(409)
    const secondSubmitBody = /** @type {any} */ (
      await secondSubmitResponse.body.json()
    )
    expect(secondSubmitBody.message).to.equal(
      'Summary log must be validated before submission. Current status: invalid'
    )

    // Third upload: adjustments. RowID 1003 is ignored (date falls outside
    // accreditation range); 4001 is from REPROCESSED_LOADS which doesn't
    // contribute to waste balance; 1001 is also adjusted; 1004 is excluded
    // from the waste balance as it has PRNs issued against it; 1005 is
    // excluded from the waste balance as it is missing Pallet Weight.
    const third = await ingestSummaryLogFixture(
      orgId,
      registrationId,
      authHeader,
      {
        s3Key: 'reprocessor-input-adjustments-key',
        filename: 'reprocessor-input-adjustments.xlsx'
      }
    )
    const thirdData = await waitForSummaryLogStatus(
      third.baseAPI,
      third.summaryLogPath,
      authHeader,
      'validated'
    )

    assertLoads(thirdData.loads, [
      { loadType: 'added.valid', count: 4, rowIds: '1004,4001,4002,5001' },
      { loadType: 'added.invalid', count: 1, rowIds: '1005' },
      { loadType: 'added.included', count: 2, rowIds: '1004,5001' },
      { loadType: 'added.excluded', count: 2, rowIds: '1003,1005' },
      { loadType: 'unchanged.valid', count: 3, rowIds: '1000,4000,5000' },
      { loadType: 'unchanged.invalid', count: 0, rowIds: '' },
      { loadType: 'unchanged.included', count: 2, rowIds: '1000,5000' },
      { loadType: 'unchanged.excluded', count: 0, rowIds: '' },
      { loadType: 'adjusted.valid', count: 1, rowIds: '1001' },
      { loadType: 'adjusted.invalid', count: 1, rowIds: '1002' },
      { loadType: 'adjusted.included', count: 1, rowIds: '1001' },
      { loadType: 'adjusted.excluded', count: 1, rowIds: '1002' }
    ])

    assertReportingPeriodLoads(thirdData.loadsByReportingPeriod, {
      'openPeriodLoads.added.balanceAffecting.count': 1,
      'openPeriodLoads.added.balanceAffecting.tonnageDelta': -50,
      'openPeriodLoads.added.nonBalanceAffecting.count': 4,
      'openPeriodLoads.adjusted.balanceAffecting.count': 1,
      'openPeriodLoads.adjusted.balanceAffecting.tonnageDelta': 74.89,
      'openPeriodLoads.adjusted.nonBalanceAffecting.count': 1,
      'closedPeriodLoads.added.balanceAffecting.count': 0
    })

    assertReportingPeriodBucketRows(thirdData.loadsByReportingPeriod, [
      {
        bucket: 'openPeriodLoads.added.balanceAffecting',
        rowId: '5001',
        wasteRecordType: 'sentOn',
        exclusionReasons: '',
        tonnageDelta: -50
      },
      {
        bucket: 'openPeriodLoads.added.nonBalanceAffecting',
        rowId: '1004',
        wasteRecordType: 'received',
        exclusionReasons: 'PRN_ISSUED',
        tonnageDelta: 0
      },
      {
        bucket: 'openPeriodLoads.added.nonBalanceAffecting',
        rowId: '1005',
        wasteRecordType: 'received',
        exclusionReasons: 'MISSING_REQUIRED_FIELD',
        tonnageDelta: 0
      },
      {
        bucket: 'openPeriodLoads.adjusted.balanceAffecting',
        rowId: '1001',
        wasteRecordType: 'received',
        exclusionReasons: '',
        tonnageDelta: 74.89
      },
      {
        bucket: 'openPeriodLoads.adjusted.nonBalanceAffecting',
        rowId: '1002',
        wasteRecordType: 'received',
        exclusionReasons: 'MISSING_REQUIRED_FIELD',
        tonnageDelta: 0
      }
    ])

    const thirdSubmitResponse = await third.baseAPI.post(
      `${third.summaryLogPath}/submit`,
      '',
      authHeader
    )
    expect(thirdSubmitResponse.statusCode).to.equal(200)
    await waitForSummaryLogStatus(
      third.baseAPI,
      third.summaryLogPath,
      authHeader,
      'submitted'
    )

    const balanceAfterThird = await waitForWasteBalance(
      orgId,
      accreditationId,
      authHeader,
      45000
    )
    expect(parseFloat(balanceAfterThird[accreditationId].amount)).to.equal(
      386.51
    )
    expect(
      parseFloat(balanceAfterThird[accreditationId].availableAmount)
    ).to.equal(386.51)
  })

  test('fails in-sheet revalidation @summaryLogReprocessorInputInvalid', async () => {
    const { summaryLogPath, baseAPI } = await ingestSummaryLogFixture(
      orgId,
      registrationId,
      authHeader,
      {
        s3Key: 'reprocessor-input-invalid-key',
        filename: 'reprocessor-input-invalid.xlsx'
      }
    )
    const responseData = await waitForSummaryLogStatus(
      baseAPI,
      summaryLogPath,
      authHeader,
      'invalid'
    )

    const sheet = 'Received (sections 1, 2 and 3)'
    const table = 'RECEIVED_LOADS_FOR_REPROCESSING'
    assertValidationFailures(responseData.validation.failures, [
      {
        code: 'VALUE_OUT_OF_RANGE',
        sheet,
        table,
        row: 6,
        header: 'RECYCLABLE_PROPORTION_PERCENTAGE',
        actual: 1.75
      },
      {
        code: 'VALUE_OUT_OF_RANGE',
        sheet,
        table,
        row: 6,
        header: 'WEIGHT_OF_NON_TARGET_MATERIALS',
        actual: 1345
      },
      {
        code: 'INVALID_DATE',
        sheet,
        table,
        row: 6,
        header: 'DATE_RECEIVED_FOR_REPROCESSING',
        actual: '30-06-2025'
      },
      {
        code: 'INVALID_TYPE',
        sheet,
        table,
        row: 6,
        header: 'WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE',
        actual: 'Unsure'
      },
      {
        code: 'INVALID_TYPE',
        sheet,
        table,
        row: 6,
        header: 'BAILING_WIRE_PROTOCOL',
        actual: 'Invalid'
      },
      {
        code: 'VALUE_OUT_OF_RANGE',
        sheet,
        table,
        row: 6,
        header: 'GROSS_WEIGHT',
        actual: 3500
      },
      {
        code: 'VALUE_OUT_OF_RANGE',
        sheet,
        table,
        row: 6,
        header: 'NET_WEIGHT',
        actual: 1275
      },
      {
        code: 'VALUE_OUT_OF_RANGE',
        sheet,
        table,
        row: 6,
        header: 'TARE_WEIGHT',
        actual: 1115
      },
      {
        code: 'VALUE_OUT_OF_RANGE',
        sheet,
        table,
        row: 6,
        header: 'PALLET_WEIGHT',
        actual: 1110
      },
      {
        code: 'INVALID_TYPE',
        sheet,
        table,
        row: 6,
        header: 'DESCRIPTION_WASTE',
        actual: 'Wrong description'
      },
      {
        code: 'INVALID_TYPE',
        sheet,
        table,
        row: 6,
        header: 'EWC_CODE',
        actual: 'Invalid EWC'
      },
      {
        code: 'INVALID_TYPE',
        sheet,
        table,
        row: 6,
        header: 'HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION',
        actual: 'Wrong value'
      },
      {
        code: 'VALUE_OUT_OF_RANGE',
        sheet,
        table,
        row: 6,
        header: 'TONNAGE_RECEIVED_FOR_RECYCLING',
        actual: -122.5
      }
    ])

    const submitResponse = await baseAPI.post(
      `${summaryLogPath}/submit`,
      '',
      authHeader
    )
    expect(submitResponse.statusCode).to.equal(409)
    const body = /** @type {any} */ (await submitResponse.body.json())
    expect(body.message).to.equal(
      'Summary log must be validated before submission. Current status: invalid'
    )
  })

  test('fails in-sheet revalidation on the Sent On sheet @summaryLogReprocessorInputSentOnInvalid', async () => {
    const { summaryLogPath, baseAPI } = await ingestSummaryLogFixture(
      orgId,
      registrationId,
      authHeader,
      {
        s3Key: 'reprocessor-input-senton-invalid-key',
        filename: 'reprocessor-input-senton-invalid.xlsx'
      }
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
        sheet: 'Sent on (sections 5, 6 and 7)',
        table: 'SENT_ON_LOADS',
        row: 4,
        header: 'DATE_LOAD_LEFT_SITE',
        actual: '30-02-2025'
      },
      {
        code: 'VALUE_OUT_OF_RANGE',
        sheet: 'Sent on (sections 5, 6 and 7)',
        table: 'SENT_ON_LOADS',
        row: 4,
        header: 'TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON',
        actual: 1001
      }
    ])

    const submitResponse = await baseAPI.post(
      `${summaryLogPath}/submit`,
      '',
      authHeader
    )
    expect(submitResponse.statusCode).to.equal(409)
    const body = /** @type {any} */ (await submitResponse.body.json())
    expect(body.message).to.equal(
      'Summary log must be validated before submission. Current status: invalid'
    )
  })
})
