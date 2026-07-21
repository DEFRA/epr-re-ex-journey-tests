import { expect } from 'chai'
import { BaseAPI } from '../apis/base-api.js'
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
  assertReportingPeriodLoads,
  assertValidationFailures
} from '../support/summary-log-assertions.js'

// Ported from epr-backend-journey-tests' summarylogs-reprocessor-output.feature.
// See summarylogs-validation.api.e2e.js for the shared floci-fixture-shortcut
// rationale and the loadsByWasteRecordType/DB-assertion gaps this repeats.
describe('Summary Logs - Reprocessor on Output @summaryLogReprocessorOutput', () => {
  let orgId
  let registrationId
  let accreditationId
  let authHeader

  before(async () => {
    const org = await createLinkedOrganisation([
      { wasteProcessingType: 'Reprocessor', material: 'Steel (R4)' }
    ])
    const migrated = await updateMigratedOrganisation(org.refNo, [
      {
        reprocessingType: 'output',
        regNumber: 'R25SR500050912PA',
        accNumber: 'ACC500591',
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
  })

  it('fails in-sheet revalidation @summaryLogReprocessorOutputInvalid', async () => {
    const { summaryLogPath, baseAPI } = await ingestSummaryLogFixture(
      orgId,
      registrationId,
      authHeader,
      {
        s3Key: 'reprocessor-output-invalid-key',
        filename: 'reprocessor-output-invalid.xlsx'
      }
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
    const body = await submitResponse.body.json()
    expect(body.message).to.equal(
      'Summary log must be validated before submission. Current status: invalid'
    )
  })

  it('succeeds, with waste balance calculated over an initial upload and an adjustments upload @summaryLogReprocessorOutputValidatedFlow', async function () {
    this.timeout(120000)

    const first = await ingestSummaryLogFixture(
      orgId,
      registrationId,
      authHeader,
      {
        s3Key: 'reprocessor-output-valid-key',
        filename: 'reprocessor-output-valid.xlsx'
      }
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
    expect(parseFloat(balanceAfterFirst[accreditationId].amount)).to.equal(3)
    expect(
      parseFloat(balanceAfterFirst[accreditationId].availableAmount)
    ).to.equal(3)

    // Adjustments: RowID 3001 is ignored (date falls outside accreditation
    // range); 1003/5002 are from non-contributing tables; 3003/3004 are
    // excluded from the waste balance as they are missing mandatory fields;
    // 3000 is also adjusted.
    const second = await ingestSummaryLogFixture(
      orgId,
      registrationId,
      authHeader,
      {
        s3Key: 'reprocessor-output-adjustments-key',
        filename: 'reprocessor-output-adjustments.xlsx'
      }
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
    expect(parseFloat(balanceAfterSecond[accreditationId].amount)).to.equal(
      9.25
    )
    expect(
      parseFloat(balanceAfterSecond[accreditationId].availableAmount)
    ).to.equal(9.25)

    const baseAPI = new BaseAPI()
    const reportPath = `/v1/organisations/${orgId}/registrations/${registrationId}/reports/2026/monthly/1/submissions/1`
    const reportResponse = await baseAPI.get(reportPath, authHeader)
    expect(reportResponse.statusCode).to.equal(200)
    const report = await reportResponse.body.json()

    expect(report.operatorCategory).to.equal('REPROCESSOR')
    expect(report.cadence).to.equal('monthly')
    expect(report.recyclingActivity.totalTonnageReceived).to.equal(106.11)
    expect(report.wasteSent.tonnageSentToReprocessor).to.equal(40)
    expect(report.details.material).to.equal('steel')
  })
})
