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

// Ported from epr-backend-journey-tests' summarylogs-validation.feature.
// Each scenario feeds the real, pre-seeded floci S3 fixtures from
// docker/scripts/floci/summarylogs/ (seeded at fixed keys by
// docker/scripts/floci/init.sh) directly to the upload-completed callback,
// so the real async validation worker produces genuine validation
// failures/loads data - no CDP uploader multipart round-trip needed.
describe('Summary log row-level validation @summaryLogValidation', () => {
  let orgId
  let registrationId
  let authHeader

  before(async () => {
    const org = await createLinkedOrganisation([
      { wasteProcessingType: 'Reprocessor' },
      { wasteProcessingType: 'Exporter' },
      { wasteProcessingType: 'Reprocessor', material: 'Steel (R4)' }
    ])
    // Fixture row dates are anchored to 2025 - explicit validFrom matches
    // the original Cucumber suite's own default (organisations.steps.js
    // defaults to '2025-01-01' when the data table omits it) rather than
    // this repo's updateMigratedOrganisation default of '2026-01-01', which
    // would push these rows' dates before the accreditation's validFrom and
    // wrongly exclude them from the waste balance.
    const migrated = await updateMigratedOrganisation(
      org.refNo,
      [
        {
          reprocessingType: 'input',
          regNumber: 'R25SR500030912PA',
          accNumber: 'ACC123456',
          status: 'approved'
        },
        {
          regNumber: 'E25SR500030913PA',
          accNumber: 'ACC234567',
          status: 'approved'
        },
        {
          reprocessingType: 'output',
          regNumber: 'R25SR500050912PA',
          accNumber: 'ACC500591',
          status: 'approved'
        }
      ],
      undefined,
      '2025-01-01'
    )
    const user = await createAndRegisterDefraIdUser(migrated.email)
    await linkDefraIdUser(org.refNo, user.userId, migrated.email)
    authHeader = defraIdStub.authHeader(user.userId)
    orgId = org.refNo
    registrationId = migrated.registrationIds[0]
  })

  it('fails validation (Fatal) for Invalid Row ID and cannot be submitted @summaryLogInvalidRowId', async () => {
    const { summaryLogPath, baseAPI } = await ingestSummaryLogFixture(
      orgId,
      registrationId,
      authHeader,
      { s3Key: 'invalid-row-id-key', filename: 'invalid-row-id.xlsx' }
    )
    const responseData = await waitForSummaryLogStatus(
      baseAPI,
      summaryLogPath,
      authHeader,
      'invalid'
    )

    assertValidationFailures(responseData.validation.failures, [
      {
        code: 'VALUE_OUT_OF_RANGE',
        sheet: 'Received (sections 1, 2 and 3)',
        table: 'RECEIVED_LOADS_FOR_REPROCESSING',
        actual: 100
      },
      {
        code: 'VALUE_OUT_OF_RANGE',
        sheet: 'Received (sections 1, 2 and 3)',
        table: 'RECEIVED_LOADS_FOR_REPROCESSING',
        actual: 101
      },
      {
        code: 'VALUE_OUT_OF_RANGE',
        sheet: 'Received (sections 1, 2 and 3)',
        table: 'RECEIVED_LOADS_FOR_REPROCESSING',
        actual: 102
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

  it('fails validation (Fatal) for Invalid Table name and cannot be submitted @summaryLogInvalidTableName', async () => {
    const { summaryLogPath, baseAPI } = await ingestSummaryLogFixture(
      orgId,
      registrationId,
      authHeader,
      { s3Key: 'invalid-table-name-key', filename: 'invalid-table-name.xlsx' }
    )
    const responseData = await waitForSummaryLogStatus(
      baseAPI,
      summaryLogPath,
      authHeader,
      'invalid'
    )

    assertValidationFailures(responseData.validation.failures, [
      {
        code: 'TABLE_UNRECOGNISED',
        sheet: 'Received (sections 1, 2 and 3)',
        table: 'INVALID_TABLE'
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

  it('accepts upload and marks as invalid when summary log validation fails @summaryLogUploadCompletedInvalid', async () => {
    // NOT covered: the source's DB-level assertion that the summary log
    // document itself was created with matching file/status fields - this
    // API test layer has no MongoDB client wired up (HTTP-only throughout
    // test/api-specs/), same gap as summarylogs-period-closed-during-submit.
    const { summaryLogPath, baseAPI } = await ingestSummaryLogFixture(
      orgId,
      registrationId,
      authHeader,
      {
        s3Key: 'invalid-test-upload-key',
        filename: 'invalid-test-upload.xlsx'
      }
    )
    const responseData = await waitForSummaryLogStatus(
      baseAPI,
      summaryLogPath,
      authHeader,
      'invalid'
    )

    assertValidationFailures(responseData.validation.failures, [
      { code: 'PROCESSING_TYPE_INVALID', field: 'PROCESSING_TYPE' },
      { code: 'VALIDATION_FALLBACK_ERROR', field: 'PROCESSING_TYPE' },
      { code: 'TEMPLATE_VERSION_INVALID', field: 'TEMPLATE_VERSION' },
      { code: 'REGISTRATION_REQUIRED', field: 'REGISTRATION_NUMBER' }
    ])
  })

  it('processes with pending status and all required fields @summaryLogUploadCompletedPending', async () => {
    // NOT covered: the source's structured-log-message assertion and its DB
    // check - no log capture or MongoDB client wired up in this layer.
    const { summaryLogPath, baseAPI } = await ingestSummaryLogFixture(
      orgId,
      registrationId,
      authHeader,
      {
        s3Key: 'test-upload-key',
        filename: 'test-upload.xlsx',
        fileStatus: 'pending'
      }
    )
    const responseData = await waitForSummaryLogStatus(
      baseAPI,
      summaryLogPath,
      authHeader,
      'preprocessing'
    )
    expect(responseData.status).to.equal('preprocessing')
  })

  it('processes with rejected status with all required fields @summaryLogUploadCompletedRejected', async () => {
    // NOT covered: same log-message/DB gap as the pending-status case above.
    const { summaryLogPath, baseAPI } = await ingestSummaryLogFixture(
      orgId,
      registrationId,
      authHeader,
      {
        s3Key: 'test-upload-key',
        filename: 'test-upload.xlsx',
        fileStatus: 'rejected'
      }
    )
    const responseData = await waitForSummaryLogStatus(
      baseAPI,
      summaryLogPath,
      authHeader,
      'rejected'
    )
    expect(responseData.status).to.equal('rejected')
    expect(responseData.validation.failures[0].code).to.equal('FILE_REJECTED')
  })

  // RowID 1000 has a missing DATE_RECEIVED column
  //
  // NOT covered: the source's per-waste-record-type load breakdown
  // (loadsByWasteRecordType, i.e. received/processed/sentOn sub-counts). The
  // epr-backend image this compose stack currently runs does not compute
  // that field at all - confirmed by reading the running container's own
  // classify-and-persist.js, which only returns { loads, loadsByReportingPeriod }
  // with no loadsByWasteRecordType field, even though the sibling epr-backend
  // git checkout's source (PAE-1261) has long since added it. The deployed
  // image is genuinely behind that checkout despite its git.hash label
  // claiming to descend from that commit - an environment/build gap, not a
  // test bug. Revisit once the running image picks up that feature.
  it('creates Waste Records but excludes missing date row @summaryLogMissingDateRow', async () => {
    const { summaryLogPath, baseAPI } = await ingestSummaryLogFixture(
      orgId,
      registrationId,
      authHeader,
      { s3Key: 'missing-date-row-key', filename: 'missing-date-row.xlsx' }
    )
    const responseData = await waitForSummaryLogStatus(
      baseAPI,
      summaryLogPath,
      authHeader,
      'validated'
    )

    assertLoads(responseData.loads, [
      { loadType: 'added.valid', count: 3, rowIds: '1001,4000,5000' },
      { loadType: 'added.invalid', count: 2, rowIds: '1000,1002' },
      { loadType: 'added.included', count: 2, rowIds: '1001,5000' },
      { loadType: 'added.excluded', count: 2, rowIds: '1000,1002' }
    ])

    assertReportingPeriodLoads(responseData.loadsByReportingPeriod, {
      'openPeriodLoads.added.balanceAffecting.count': 2,
      'openPeriodLoads.added.balanceAffecting.tonnageDelta': 309.99,
      'openPeriodLoads.added.nonBalanceAffecting.count': 2,
      'openPeriodLoads.adjusted.balanceAffecting.count': 0,
      'closedPeriodLoads.added.balanceAffecting.count': 0
    })
  })
})
