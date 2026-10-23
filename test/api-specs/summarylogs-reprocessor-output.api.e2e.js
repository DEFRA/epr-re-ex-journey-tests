import { test } from '@playwright/test'
import { expect } from 'chai'
import {
  createAndRegisterDefraIdUser,
  linkDefraIdUser
} from '../support/defra-id-linking.js'
import { generateNumbers } from '../support/reg-acc-number.js'
import {
  createLinkedOrganisation,
  updateMigratedOrganisation
} from '../support/seeding/organisation.js'
import {
  registrationStartYear,
  summaryLogNumbered,
  uploadSummaryLog
} from '../support/seeding/summary-logs.js'
import {
  waitForSummaryLogStatus,
  waitForWasteBalance
} from '../support/seeding/waiters.js'
import { readReportDetail } from '../support/seeding/reports.js'
import { defraIdStub } from '../support/defra-id-stub.js'
import {
  assertLoads,
  assertReportingPeriodLoads,
  assertValidationFailures
} from '../support/summary-log-assertions.js'

const FLOCI_SUMMARY_LOGS = 'docker/scripts/floci/summarylogs'

// Ported from epr-backend-journey-tests' summarylogs-reprocessor-output.feature.
// See summarylogs-validation.api.e2e.js for the floci fixtures and the
// loadsByWasteRecordType/DB-assertion gaps this repeats.
test.describe('Summary Logs - Reprocessor on Output @summaryLogReprocessorOutput', () => {
  let orgId
  let registrationId
  let accreditationId
  let year
  let authHeader
  /** @type {import('../support/reg-acc-number.js').SeededNumbers} */
  let numbers

  test.beforeAll(async () => {
    numbers = generateNumbers({
      wasteProcessingType: 'reprocessor',
      materialSuffix: 'PA'
    })
    const org = await createLinkedOrganisation([
      { wasteProcessingType: 'Reprocessor', material: 'Steel (R4)' }
    ])
    const migrated = await updateMigratedOrganisation(org.refNo, [
      {
        reprocessingType: 'output',
        ...numbers,
        status: 'approved',
        validFrom: '2026-01-01'
      }
    ])
    const user = await createAndRegisterDefraIdUser(migrated.email)
    await linkDefraIdUser(org.refNo, user.userId, migrated.email)
    authHeader = defraIdStub.authHeader(user.userId)
    orgId = org.refNo
    registrationId = migrated.registrationIds[0]
    accreditationId = migrated.accreditationIds[0]
    year = registrationStartYear('2026-01-01')
  })

  test('fails in-sheet revalidation @summaryLogReprocessorOutputInvalid', async () => {
    const { summaryLogPath, baseAPI } = await uploadSummaryLog(
      orgId,
      registrationId,
      authHeader,
      await summaryLogNumbered(
        `${FLOCI_SUMMARY_LOGS}/reprocessor-output-invalid.xlsx`,
        numbers
      ),
      year
    )
    const responseData = await waitForSummaryLogStatus(
      baseAPI,
      summaryLogPath,
      authHeader,
      'invalid'
    )

    const sheet = 'Reprocessed (sections 3 and 4)'
    const table = 'REPROCESSED_LOADS'
    assertValidationFailures(responseData.validation.failures, [
      {
        code: 'INVALID_DATE',
        sheet,
        table,
        row: 4,
        header: 'DATE_LOAD_LEFT_SITE',
        actual: '30-06-2025'
      },
      {
        code: 'VALUE_OUT_OF_RANGE',
        sheet,
        table,
        row: 4,
        header: 'PRODUCT_TONNAGE',
        actual: 1005
      },
      {
        code: 'VALUE_OUT_OF_RANGE',
        sheet,
        table,
        row: 4,
        header: 'UK_PACKAGING_WEIGHT_PERCENTAGE',
        actual: 1.1
      },
      {
        code: 'INVALID_TYPE',
        sheet,
        table,
        row: 4,
        header: 'ADD_PRODUCT_WEIGHT',
        actual: 'Invalid'
      },
      {
        code: 'VALUE_OUT_OF_RANGE',
        sheet,
        table,
        row: 4,
        header: 'PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION',
        actual: 1105.5
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

  test('succeeds, with waste balance calculated over an initial upload and an adjustments upload @summaryLogReprocessorOutputValidatedFlow', async () => {
    test.setTimeout(120000)

    const first = await uploadSummaryLog(
      orgId,
      registrationId,
      authHeader,
      await summaryLogNumbered(
        `${FLOCI_SUMMARY_LOGS}/reprocessor-output-valid.xlsx`,
        numbers
      ),
      year
    )
    const firstData = await waitForSummaryLogStatus(
      first.baseAPI,
      first.summaryLogPath,
      authHeader,
      'validated'
    )

    assertLoads(firstData.loads, [
      {
        loadType: 'added.valid',
        count: 6,
        rowIds: '1000,1001,1002,3000,5000,5001'
      },
      { loadType: 'added.invalid', count: 0, rowIds: '' },
      { loadType: 'added.included', count: 1, rowIds: '3000' },
      { loadType: 'added.excluded', count: 0, rowIds: '' }
    ])

    assertReportingPeriodLoads(firstData.loadsByReportingPeriod, {
      'openPeriodLoads.added.balanceAffecting.count': 1,
      'openPeriodLoads.added.balanceAffecting.tonnageDelta': 3,
      'openPeriodLoads.added.nonBalanceAffecting.count': 5,
      'openPeriodLoads.adjusted.balanceAffecting.count': 0,
      'closedPeriodLoads.added.balanceAffecting.count': 0
    })

    const firstSubmitResponse = await first.baseAPI.post(
      `${first.summaryLogPath}/submit`,
      '',
      authHeader
    )
    expect(firstSubmitResponse.statusCode).to.equal(200)
    await waitForSummaryLogStatus(
      first.baseAPI,
      first.summaryLogPath,
      authHeader,
      'submitted'
    )

    const balanceAfterFirst = await waitForWasteBalance(
      orgId,
      accreditationId,
      authHeader
    )
    expect(parseFloat(balanceAfterFirst.amount)).to.equal(3)
    expect(parseFloat(balanceAfterFirst.availableAmount)).to.equal(3)

    // Adjustments: RowID 3001 is ignored (date falls outside accreditation
    // range); 1003/5002 are from non-contributing tables; 3003/3004 are
    // excluded from the waste balance as they are missing mandatory fields;
    // 3000 is also adjusted.
    const second = await uploadSummaryLog(
      orgId,
      registrationId,
      authHeader,
      await summaryLogNumbered(
        `${FLOCI_SUMMARY_LOGS}/reprocessor-output-adjustments.xlsx`,
        numbers
      ),
      year
    )
    const secondData = await waitForSummaryLogStatus(
      second.baseAPI,
      second.summaryLogPath,
      authHeader,
      'validated'
    )

    assertLoads(secondData.loads, [
      { loadType: 'added.valid', count: 3, rowIds: '1003,3002,5002' },
      { loadType: 'added.invalid', count: 2, rowIds: '3003,3004' },
      { loadType: 'added.included', count: 1, rowIds: '3002' },
      { loadType: 'added.excluded', count: 3, rowIds: '3001,3003,3004' },
      {
        loadType: 'unchanged.valid',
        count: 5,
        rowIds: '1000,1001,1002,5000,5001'
      },
      { loadType: 'unchanged.invalid', count: 0, rowIds: '' },
      { loadType: 'unchanged.included', count: 0, rowIds: '' },
      { loadType: 'unchanged.excluded', count: 0, rowIds: '' },
      { loadType: 'adjusted.valid', count: 1, rowIds: '3000' },
      { loadType: 'adjusted.invalid', count: 0, rowIds: '' },
      { loadType: 'adjusted.included', count: 1, rowIds: '3000' },
      { loadType: 'adjusted.excluded', count: 0, rowIds: '' }
    ])

    assertReportingPeriodLoads(secondData.loadsByReportingPeriod, {
      'openPeriodLoads.added.balanceAffecting.count': 1,
      'openPeriodLoads.added.balanceAffecting.tonnageDelta': 4.25,
      'openPeriodLoads.added.nonBalanceAffecting.count': 3,
      'openPeriodLoads.adjusted.balanceAffecting.count': 1,
      'openPeriodLoads.adjusted.balanceAffecting.tonnageDelta': 2,
      'openPeriodLoads.adjusted.nonBalanceAffecting.count': 0,
      'closedPeriodLoads.added.balanceAffecting.count': 0
    })

    const secondSubmitResponse = await second.baseAPI.post(
      `${second.summaryLogPath}/submit`,
      '',
      authHeader
    )
    expect(secondSubmitResponse.statusCode).to.equal(200)
    await waitForSummaryLogStatus(
      second.baseAPI,
      second.summaryLogPath,
      authHeader,
      'submitted'
    )

    const balanceAfterSecond = await waitForWasteBalance(
      orgId,
      accreditationId,
      authHeader,
      45000
    )
    expect(parseFloat(balanceAfterSecond.amount)).to.equal(9.25)
    expect(parseFloat(balanceAfterSecond.availableAmount)).to.equal(9.25)

    const report = await readReportDetail(orgId, registrationId, {
      year: 2026,
      cadence: 'monthly',
      period: 1,
      submissionNumber: 1
    })

    expect(report.operatorCategory).to.equal('REPROCESSOR')
    expect(report.cadence).to.equal('monthly')
    expect(report.recyclingActivity.totalTonnageReceived).to.equal(106.11)
    expect(report.wasteSent.tonnageSentToReprocessor).to.equal(40)
    expect(report.details.material).to.equal('steel')
  })
})
