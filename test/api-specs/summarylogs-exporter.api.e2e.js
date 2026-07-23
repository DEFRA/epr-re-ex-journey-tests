import { test } from '@playwright/test'
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
import { assertValidationFailures } from '../support/summary-log-assertions.js'

// Ported from epr-backend-journey-tests' summarylogs-exporter.feature.
// See summarylogs-validation.api.e2e.js for the shared floci-fixture-shortcut
// rationale and the loadsByWasteRecordType/DB-assertion gaps this repeats.
//
// NOT ported: the source's second scenario ("succeeds, with waste balance
// calculated"), which depends on a real ORS (overseas sites) import via
// spreadsheet upload before the summary log's OSR_ID rows can validate.
// That flow is the same real ORS-import pipeline parked for backlog item 8
// (overseas-sites-accreditation-list) - disproportionate effort for one
// scenario, revisit alongside that item.
test.describe('Summary Logs - Exporter @summaryLogExporter', () => {
  test('fails in-sheet revalidation @summaryLogExporterInvalid', async () => {
    const org = await createLinkedOrganisation([
      { wasteProcessingType: 'Exporter' }
    ])
    const migrated = await updateMigratedOrganisation(org.refNo, [
      {
        regNumber: 'E25SR500030913PA',
        accNumber: 'ACC234567',
        status: 'approved'
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
      { s3Key: 'exporter-invalid-key', filename: 'exporter-invalid.xlsx' }
    )
    const responseData = await waitForSummaryLogStatus(
      baseAPI,
      summaryLogPath,
      authHeader,
      'invalid'
    )

    const sheet = 'Exported (sections 1, 2 and 3)'
    const table = 'RECEIVED_LOADS_FOR_EXPORT'
    const longValue =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789098765432101234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789098765432101234567890'
    assertValidationFailures(responseData.validation.failures, [
      {
        code: 'INVALID_DATE',
        sheet,
        table,
        row: 4,
        header: 'DATE_OF_EXPORT',
        actual: 'TBC'
      },
      {
        code: 'VALUE_OUT_OF_RANGE',
        sheet,
        table,
        row: 4,
        header: 'CONTAINER_NUMBER',
        actual: longValue
      },
      {
        code: 'VALUE_OUT_OF_RANGE',
        sheet,
        table,
        row: 4,
        header: 'CUSTOMS_CODES',
        actual: longValue
      },
      {
        code: 'VALUE_OUT_OF_RANGE',
        sheet,
        table,
        row: 4,
        header: 'TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED',
        actual: 1002
      },
      {
        code: 'VALUE_OUT_OF_RANGE',
        sheet,
        table,
        row: 4,
        header: 'WEIGHT_OF_NON_TARGET_MATERIALS',
        actual: 1005
      },
      {
        code: 'VALUE_OUT_OF_RANGE',
        sheet,
        table,
        row: 4,
        header: 'RECYCLABLE_PROPORTION_PERCENTAGE',
        actual: 1.1
      },
      {
        code: 'INVALID_TYPE',
        sheet,
        table,
        row: 4,
        header: 'DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE',
        actual: 'notValid'
      },
      {
        code: 'INVALID_TYPE',
        sheet,
        table,
        row: 4,
        header: 'EWC_CODE',
        actual: 'Invalid EWC'
      },
      {
        code: 'INVALID_TYPE',
        sheet,
        table,
        row: 4,
        header: 'BASEL_EXPORT_CODE',
        actual: 'NotABasel'
      },
      {
        code: 'INVALID_TYPE',
        sheet,
        table,
        row: 4,
        header: 'BAILING_WIRE_PROTOCOL',
        actual: 'Invalid'
      },
      {
        code: 'INVALID_TYPE',
        sheet,
        table,
        row: 4,
        header: 'DESCRIPTION_WASTE',
        actual: 'WrongDesc'
      },
      {
        code: 'VALUE_OUT_OF_RANGE',
        sheet,
        table,
        row: 4,
        header: 'GROSS_WEIGHT',
        actual: 1010
      },
      {
        code: 'VALUE_OUT_OF_RANGE',
        sheet,
        table,
        row: 4,
        header: 'NET_WEIGHT',
        actual: -50
      },
      {
        code: 'VALUE_OUT_OF_RANGE',
        sheet,
        table,
        row: 4,
        header: 'TARE_WEIGHT',
        actual: -10
      },
      {
        code: 'VALUE_OUT_OF_RANGE',
        sheet,
        table,
        row: 4,
        header: 'PALLET_WEIGHT',
        actual: -50
      },
      {
        code: 'INVALID_TYPE',
        sheet,
        table,
        row: 4,
        header: 'OSR_ID',
        actual: '98A'
      },
      {
        code: 'INVALID_DATE',
        sheet,
        table,
        row: 4,
        header: 'DATE_RECEIVED_BY_OSR',
        actual: '30-02-2025'
      },
      {
        code: 'INVALID_DATE',
        sheet,
        table,
        row: 4,
        header: 'DATE_RECEIVED_FOR_EXPORT',
        actual: '????'
      },
      {
        code: 'INVALID_TYPE',
        sheet,
        table,
        row: 4,
        header: 'WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE',
        actual: 'Unknown'
      },
      {
        code: 'INVALID_TYPE',
        sheet,
        table,
        row: 4,
        header: 'HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION',
        actual: 'Invalid'
      },
      {
        code: 'VALUE_OUT_OF_RANGE',
        sheet,
        table,
        row: 4,
        header: 'TONNAGE_RECEIVED_FOR_EXPORT',
        actual: -1160.5
      },
      {
        code: 'VALUE_OUT_OF_RANGE',
        sheet,
        table,
        row: 4,
        header: 'TONNAGE_PASSED_INTERIM_SITE_RECEIVED_BY_OSR',
        actual: -50
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
