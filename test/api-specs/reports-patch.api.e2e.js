import { test } from '@playwright/test'
import { expect } from 'chai'
import { BaseAPI } from '../apis/base-api.js'
import { defraIdStub } from '../support/defra-id-stub.js'
import {
  createAndRegisterDefraIdUser,
  createLinkedOrganisation,
  linkDefraIdUser,
  updateMigratedOrganisation
} from '../support/apicalls.js'

const YEAR = 2026
const CADENCE = 'monthly'
const PERIOD = 1
const SUBMISSION_NUMBER = 1

async function setUpExporterWithReport() {
  const baseAPI = new BaseAPI()

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

  const registrationId = migrated.registrationIds[0]
  const authHeader = defraIdStub.authHeader(user.userId)
  const reportPath = `/v1/organisations/${org.refNo}/registrations/${registrationId}/reports/${YEAR}/${CADENCE}/${PERIOD}/submissions/${SUBMISSION_NUMBER}`

  const createResponse = await baseAPI.post(reportPath, '', authHeader)
  expect(createResponse.statusCode).to.equal(201)

  return { baseAPI, org, registrationId, authHeader, reportPath }
}

test.describe('Reports PATCH endpoint @reportsPatch', () => {
  test('succeeds patching prnRevenue on an in_progress report @reportsPatchPrnRevenue', async () => {
    const { baseAPI, authHeader, reportPath } = await setUpExporterWithReport()

    const response = await baseAPI.patch(
      reportPath,
      JSON.stringify({ prnRevenue: 1576.12 }),
      authHeader
    )

    expect(response.statusCode).to.equal(200)
    const body = /** @type {any} */ (await response.body.json())
    expect(body.prn.totalRevenue).to.equal(1576.12)
  })

  test('succeeds patching freeTonnage on an in_progress report @reportsPatchFreeTonnage', async () => {
    const { baseAPI, authHeader, reportPath } = await setUpExporterWithReport()

    const response = await baseAPI.patch(
      reportPath,
      JSON.stringify({ freeTonnage: 0 }),
      authHeader
    )

    expect(response.statusCode).to.equal(200)
    const body = /** @type {any} */ (await response.body.json())
    expect(body.prn.freeTonnage).to.equal(0)
  })

  test('succeeds patching prnRevenue and freeTonnage together @reportsPatchBothFields', async () => {
    const { baseAPI, authHeader, reportPath } = await setUpExporterWithReport()

    const response = await baseAPI.patch(
      reportPath,
      JSON.stringify({ prnRevenue: 1576.12, freeTonnage: 0 }),
      authHeader
    )

    expect(response.statusCode).to.equal(200)
    const body = /** @type {any} */ (await response.body.json())
    expect(body.prn.totalRevenue).to.equal(1576.12)
    expect(body.prn.freeTonnage).to.equal(0)
  })

  test('rejects a negative prnRevenue with a 422 @reportsPatchNegativePrnRevenue', async () => {
    const { baseAPI, authHeader, reportPath } = await setUpExporterWithReport()

    const response = await baseAPI.patch(
      reportPath,
      JSON.stringify({ prnRevenue: -1 }),
      authHeader
    )

    expect(response.statusCode).to.equal(422)
    const body = /** @type {any} */ (await response.body.json())
    expect(body.message).to.equal(
      '"prnRevenue" must be greater than or equal to 0'
    )
  })

  test('rejects an empty PATCH body with a 422 @reportsPatchEmptyBody', async () => {
    const { baseAPI, authHeader, reportPath } = await setUpExporterWithReport()

    const response = await baseAPI.patch(
      reportPath,
      JSON.stringify({}),
      authHeader
    )

    expect(response.statusCode).to.equal(422)
    const body = /** @type {any} */ (await response.body.json())
    expect(body.message).to.equal('"value" must have at least 1 key')
  })

  test('returns a 404 for a non-existent period @reportsPatchNonExistentPeriod', async () => {
    const { baseAPI, org, registrationId, authHeader } =
      await setUpExporterWithReport()

    const nonExistentPeriod = 12
    const response = await baseAPI.patch(
      `/v1/organisations/${org.refNo}/registrations/${registrationId}/reports/${YEAR}/${CADENCE}/${nonExistentPeriod}/submissions/${SUBMISSION_NUMBER}`,
      JSON.stringify({ prnRevenue: 100 }),
      authHeader
    )

    expect(response.statusCode).to.equal(404)
    const body = /** @type {any} */ (await response.body.json())
    expect(body.message).to.equal(
      `No report found for ${CADENCE} period ${nonExistentPeriod} of ${YEAR}`
    )
  })

  test('still supports patching supportingInformation unchanged @reportsPatchSupportingInformation', async () => {
    const { baseAPI, authHeader, reportPath } = await setUpExporterWithReport()

    const response = await baseAPI.patch(
      reportPath,
      JSON.stringify({
        supportingInformation: 'Test supporting information'
      }),
      authHeader
    )

    expect(response.statusCode).to.equal(200)
    const body = /** @type {any} */ (await response.body.json())
    expect(body.supportingInformation).to.equal('Test supporting information')
  })

  test('reflects the PATCH on a subsequent GET @reportsPatchThenGet', async () => {
    const { baseAPI, org, registrationId, authHeader, reportPath } =
      await setUpExporterWithReport()

    const patchResponse = await baseAPI.patch(
      reportPath,
      JSON.stringify({ prnRevenue: 3000, freeTonnage: 0 }),
      authHeader
    )
    expect(patchResponse.statusCode).to.equal(200)

    const getResponse = await baseAPI.get(
      `/v1/organisations/${org.refNo}/registrations/${registrationId}/reports/${YEAR}/${CADENCE}/${PERIOD}/submissions/${SUBMISSION_NUMBER}`,
      authHeader
    )

    expect(getResponse.statusCode).to.equal(200)
    const body = /** @type {any} */ (await getResponse.body.json())
    expect(body.prn.totalRevenue).to.equal(3000)
    expect(body.prn.freeTonnage).to.equal(0)
  })
})
