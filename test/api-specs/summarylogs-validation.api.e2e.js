import { test } from '@playwright/test'
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
  ingestSummaryLogFixture,
  registrationStartYear
} from '../support/seeding/summary-logs.js'
import { waitForSummaryLogStatus } from '../support/seeding/waiters.js'
import { defraIdStub } from '../support/defra-id-stub.js'
import { assertValidationFailures } from '../support/summary-log-assertions.js'

// Ported from epr-backend-journey-tests' summarylogs-validation.feature.
// Each scenario uses the floci fixtures from docker/scripts/floci/summarylogs/,
// so the real async validation worker produces genuine validation
// failures/loads data. A fixture whose cover numbers must be the
// registration's own is uploaded as a renumbered copy through cdp-uploader.
// The rest are fed from their pre-seeded S3 keys (seeded by
// docker/scripts/floci/init.sh) directly to the upload-completed callback.
test.describe('Summary log row-level validation @summaryLogValidation', () => {
  let orgId
  let registrationId
  let year
  let authHeader
  /** @type {import('../support/reg-acc-number.js').SeededNumbers} */
  let inputNumbers

  test.beforeAll(async () => {
    inputNumbers = generateNumbers({
      wasteProcessingType: 'reprocessor',
      materialSuffix: 'PA'
    })
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
          ...inputNumbers,
          status: 'approved'
        },
        {
          ...generateNumbers({
            wasteProcessingType: 'exporter',
            materialSuffix: 'PA'
          }),
          status: 'approved'
        },
        {
          reprocessingType: 'output',
          ...generateNumbers({
            wasteProcessingType: 'reprocessor',
            materialSuffix: 'PA'
          }),
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
    year = registrationStartYear('2025-01-01')
  })

  test('accepts upload and marks as invalid when summary log validation fails @summaryLogUploadCompletedInvalid', async () => {
    // NOT covered: the source's DB-level assertion that the summary log
    // document itself was created with matching file/status fields - this
    // API test layer has no MongoDB client wired up (HTTP-only throughout
    // test/api-specs/).
    const { summaryLogPath, baseAPI } = await ingestSummaryLogFixture(
      orgId,
      registrationId,
      authHeader,
      {
        s3Key: 'invalid-test-upload-key',
        filename: 'invalid-test-upload.xlsx'
      },
      year
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
})
