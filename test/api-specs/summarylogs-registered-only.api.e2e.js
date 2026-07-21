import { expect } from 'chai'
import {
  createAndRegisterDefraIdUser,
  createLinkedOrganisation,
  ingestSummaryLogFixture,
  linkDefraIdUser,
  updateMigratedOrganisation,
  waitForSummaryLogStatus
} from '../support/apicalls.js'
import { defraIdStub } from '../support/defra-id-stub.js'
import {
  assertLoads,
  assertReportingPeriodLoads,
  assertValidationFailures
} from '../support/summary-log-assertions.js'

// Ported from epr-backend-journey-tests' summarylogs-exporter-registered-only.feature
// and summarylogs-reprocessor-registered-only.feature. See
// summarylogs-validation.api.e2e.js for the shared floci-fixture-shortcut
// rationale and the loadsByWasteRecordType/DB-assertion gaps this repeats.
// Registered-only registrations have no accreditation, so there is no waste
// balance to check here (unlike the accredited exporter/reprocessor specs).
describe('Summary Logs - Registered Only Exporter @summaryLogExporterRegOnly', () => {
  it('creates a Waste Record @summaryLogExporterRegOnlyValid', async function () {
    this.timeout(60000)

    const org = await createLinkedOrganisation([
      { wasteProcessingType: 'Exporter', withoutAccreditation: true }
    ])
    const migrated = await updateMigratedOrganisation(org.refNo, [
      {
        regNumber: 'E25SR500030912PA',
        status: 'approved',
        validFrom: '2025-02-02',
        withoutAccreditation: true
      }
    ])
    const user = await createAndRegisterDefraIdUser(migrated.email)
    await linkDefraIdUser(org.refNo, user.userId, migrated.email)
    const authHeader = defraIdStub.authHeader(user.userId)
    const registrationId = migrated.registrationIds[0]

    const { summaryLogPath, baseAPI } = await ingestSummaryLogFixture(
      org.refNo,
      registrationId,
      authHeader,
      {
        s3Key: 'exporter-regonly-valid-key',
        filename: 'exporter-regonly-valid.xlsx'
      }
    )
    const responseData = await waitForSummaryLogStatus(
      baseAPI,
      summaryLogPath,
      authHeader,
      'validated'
    )

    assertLoads(responseData.loads, [
      {
        loadType: 'added.valid',
        count: 15,
        rowIds:
          '1000,1001,1002,1003,1004,2000,2001,2002,2003,2004,4000,4001,4002,4003,4004'
      },
      { loadType: 'added.invalid', count: 0, rowIds: '' },
      { loadType: 'added.included', count: 0, rowIds: '' },
      { loadType: 'added.excluded', count: 0, rowIds: '' }
    ])

    assertReportingPeriodLoads(responseData.loadsByReportingPeriod, {
      'openPeriodLoads.added.balanceAffecting.count': 0,
      'openPeriodLoads.added.balanceAffecting.tonnageDelta': 0,
      'openPeriodLoads.added.nonBalanceAffecting.count': 15,
      'openPeriodLoads.adjusted.balanceAffecting.count': 0,
      'closedPeriodLoads.added.balanceAffecting.count': 0
    })

    const submitResponse = await baseAPI.post(
      `${summaryLogPath}/submit`,
      '',
      authHeader
    )
    expect(submitResponse.statusCode).to.equal(200)
    await waitForSummaryLogStatus(
      baseAPI,
      summaryLogPath,
      authHeader,
      'submitted'
    )

    const reportPath = `/v1/organisations/${org.refNo}/registrations/${registrationId}/reports/2026/quarterly/1/submissions/1`
    const createReportResponse = await baseAPI.post(reportPath, '', authHeader)
    expect(createReportResponse.statusCode).to.equal(201)

    const reportResponse = await baseAPI.get(reportPath, authHeader)
    expect(reportResponse.statusCode).to.equal(200)
    const report = await reportResponse.body.json()
    expect(report.wasteProcessingType).to.equal('exporter')
  })

  it('fails in-sheet revalidation @summaryLogExporterRegOnlyInvalid', async () => {
    const org = await createLinkedOrganisation([
      { wasteProcessingType: 'Exporter', withoutAccreditation: true }
    ])
    const migrated = await updateMigratedOrganisation(org.refNo, [
      {
        regNumber: 'E25SR500030912PA',
        status: 'approved',
        validFrom: '2025-02-02',
        withoutAccreditation: true
      }
    ])
    const user = await createAndRegisterDefraIdUser(migrated.email)
    await linkDefraIdUser(org.refNo, user.userId, migrated.email)
    const authHeader = defraIdStub.authHeader(user.userId)
    const registrationId = migrated.registrationIds[0]

    const { summaryLogPath, baseAPI } = await ingestSummaryLogFixture(
      org.refNo,
      registrationId,
      authHeader,
      {
        s3Key: 'exporter-regonly-invalid-key',
        filename: 'exporter-regonly-invalid.xlsx'
      }
    )
    const responseData = await waitForSummaryLogStatus(
      baseAPI,
      summaryLogPath,
      authHeader,
      'invalid'
    )

    const sheet = 'Received (section 1)'
    const table = 'RECEIVED_LOADS_FOR_EXPORT'
    assertValidationFailures(responseData.validation.failures, [
      {
        code: 'VALUE_OUT_OF_RANGE',
        sheet,
        table,
        row: 4,
        header: 'RECYCLABLE_PROPORTION_PERCENTAGE',
        actual: 1.22
      },
      {
        code: 'VALUE_OUT_OF_RANGE',
        sheet,
        table,
        row: 4,
        header: 'NET_WEIGHT',
        actual: -1
      },
      {
        code: 'VALUE_OUT_OF_RANGE',
        sheet,
        table,
        row: 4,
        header: 'TONNAGE_RECEIVED_FOR_EXPORT',
        actual: -18.5
      },
      {
        code: 'INVALID_TYPE',
        sheet,
        table,
        row: 4,
        header: 'HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION',
        actual: 'invalid'
      },
      {
        code: 'INVALID_FORMAT',
        sheet,
        table,
        row: 4,
        header: 'MONTH_RECEIVED_FOR_EXPORT',
        actual: '30-06-2025'
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
})

describe('Summary Logs - Registered Only Reprocessor @summaryLogReprocessorRegOnly', () => {
  it('creates a Waste Record @summaryLogReprocessorRegOnlyValid', async function () {
    this.timeout(60000)

    const org = await createLinkedOrganisation([
      { wasteProcessingType: 'Reprocessor', withoutAccreditation: true }
    ])
    const migrated = await updateMigratedOrganisation(org.refNo, [
      {
        reprocessingType: 'input',
        regNumber: 'R25SR500030912PA',
        status: 'approved',
        validFrom: '2025-02-02',
        withoutAccreditation: true
      }
    ])
    const user = await createAndRegisterDefraIdUser(migrated.email)
    await linkDefraIdUser(org.refNo, user.userId, migrated.email)
    const authHeader = defraIdStub.authHeader(user.userId)
    const registrationId = migrated.registrationIds[0]

    const { summaryLogPath, baseAPI } = await ingestSummaryLogFixture(
      org.refNo,
      registrationId,
      authHeader,
      {
        s3Key: 'reprocessor-regonly-valid-key',
        filename: 'reprocessor-regonly-valid.xlsx'
      }
    )
    const responseData = await waitForSummaryLogStatus(
      baseAPI,
      summaryLogPath,
      authHeader,
      'validated'
    )

    assertLoads(responseData.loads, [
      {
        loadType: 'added.valid',
        count: 10,
        rowIds: '1000,1001,1002,1003,1004,5000,5001,5002,5003,5004'
      },
      { loadType: 'added.invalid', count: 0, rowIds: '' },
      { loadType: 'added.included', count: 0, rowIds: '' },
      { loadType: 'added.excluded', count: 0, rowIds: '' }
    ])

    assertReportingPeriodLoads(responseData.loadsByReportingPeriod, {
      'openPeriodLoads.added.balanceAffecting.count': 0,
      'openPeriodLoads.added.balanceAffecting.tonnageDelta': 0,
      'openPeriodLoads.added.nonBalanceAffecting.count': 10,
      'openPeriodLoads.adjusted.balanceAffecting.count': 0,
      'closedPeriodLoads.added.balanceAffecting.count': 0
    })

    const submitResponse = await baseAPI.post(
      `${summaryLogPath}/submit`,
      '',
      authHeader
    )
    expect(submitResponse.statusCode).to.equal(200)
    await waitForSummaryLogStatus(
      baseAPI,
      summaryLogPath,
      authHeader,
      'submitted'
    )

    // Unlike the exporter registered-only case above, no explicit "create"
    // step is needed here: submitting the summary log leaves a placeholder
    // report record in place already (matching the source Cucumber
    // scenario, which also retrieves straight after submit).
    const reportPath = `/v1/organisations/${org.refNo}/registrations/${registrationId}/reports/2026/quarterly/1/submissions/1`
    const reportResponse = await baseAPI.get(reportPath, authHeader)
    expect(reportResponse.statusCode).to.equal(200)
    const report = await reportResponse.body.json()

    expect(report.operatorCategory).to.equal('REPROCESSOR_REGISTERED_ONLY')
    expect(report.cadence).to.equal('quarterly')
    expect(report.recyclingActivity.totalTonnageReceived).to.equal(69.34)
    expect(report.wasteSent.tonnageSentToReprocessor).to.equal(49.51)
    expect(report.details.material).to.equal('paper')
  })

  it('fails in-sheet revalidation @summaryLogReprocessorRegOnlyInvalid', async () => {
    const org = await createLinkedOrganisation([
      { wasteProcessingType: 'Reprocessor', withoutAccreditation: true }
    ])
    const migrated = await updateMigratedOrganisation(org.refNo, [
      {
        reprocessingType: 'input',
        regNumber: 'R25SR500030912PA',
        status: 'approved',
        validFrom: '2025-02-02',
        withoutAccreditation: true
      }
    ])
    const user = await createAndRegisterDefraIdUser(migrated.email)
    await linkDefraIdUser(org.refNo, user.userId, migrated.email)
    const authHeader = defraIdStub.authHeader(user.userId)
    const registrationId = migrated.registrationIds[0]

    const { summaryLogPath, baseAPI } = await ingestSummaryLogFixture(
      org.refNo,
      registrationId,
      authHeader,
      {
        s3Key: 'reprocessor-regonly-invalid-key',
        filename: 'reprocessor-regonly-invalid.xlsx'
      }
    )
    const responseData = await waitForSummaryLogStatus(
      baseAPI,
      summaryLogPath,
      authHeader,
      'invalid'
    )

    const sheet = 'Received (section 1)'
    const table = 'RECEIVED_LOADS_FOR_REPROCESSING'
    assertValidationFailures(responseData.validation.failures, [
      {
        code: 'VALUE_OUT_OF_RANGE',
        sheet,
        table,
        row: 4,
        header: 'RECYCLABLE_PROPORTION_PERCENTAGE',
        actual: 1.22
      },
      {
        code: 'VALUE_OUT_OF_RANGE',
        sheet,
        table,
        row: 4,
        header: 'NET_WEIGHT',
        actual: -1
      },
      {
        code: 'VALUE_OUT_OF_RANGE',
        sheet,
        table,
        row: 4,
        header: 'TONNAGE_RECEIVED_FOR_RECYCLING',
        actual: -18.5
      },
      {
        code: 'INVALID_TYPE',
        sheet,
        table,
        row: 4,
        header: 'HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION',
        actual: 'invalid'
      },
      {
        code: 'INVALID_FORMAT',
        sheet,
        table,
        row: 4,
        header: 'MONTH_RECEIVED_FOR_REPROCESSING',
        actual: '30-06-2025'
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
})
