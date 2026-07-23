import { test } from '@playwright/test'
import { expect } from 'chai'
import { BaseAPI } from '../apis/base-api.js'
import { BasicAuth } from '../support/basic-auth.js'
import { createLinkedOrganisation } from '../support/apicalls.js'

const OVERSEAS_SITES_PATH =
  '/v1/organisations/unknownOrgId/registrations/someRegId/accreditations/someAccId/overseas-sites'

test.describe('Basic auth @basicAuth', () => {
  const baseAPI = new BaseAPI()

  test('returns the organisation when using the default basic auth credentials @basicAuthOrganisation', async () => {
    const { refNo } = await createLinkedOrganisation([
      { wasteProcessingType: 'Reprocessor' }
    ])
    const basicAuth = new BasicAuth()
    await basicAuth.defaultBasicAuthHeader()

    const response = await baseAPI.get(
      `/v1/organisations/${refNo}`,
      basicAuth.authHeader()
    )

    expect(response.statusCode).to.equal(200)
    const body = /** @type {any} */ (await response.body.json())
    expect(body.id).to.equal(refNo)
  })

  test('returns a 422 validation error for malformed overseas-sites path params via basic auth @basicAuthOverseasSitesValidation', async () => {
    const basicAuth = new BasicAuth()
    await basicAuth.defaultBasicAuthHeader()

    const response = await baseAPI.get(
      OVERSEAS_SITES_PATH,
      basicAuth.authHeader()
    )

    expect(response.statusCode).to.equal(422)
    const body = /** @type {any} */ (await response.body.json())
    expect(body.message).to.equal(
      '"organisationId" with value "unknownOrgId" fails to match the required pattern: /^[a-f0-9]{24}$/. "registrationId" with value "someRegId" fails to match the required pattern: /^[a-f0-9]{24}$/. "accreditationId" with value "someAccId" fails to match the required pattern: /^[a-f0-9]{24}$/'
    )
  })

  test('rejects the organisation request with incorrect basic auth credentials @basicAuthInvalidCredentials', async () => {
    const { refNo } = await createLinkedOrganisation([
      { wasteProcessingType: 'Reprocessor' }
    ])
    const basicAuth = new BasicAuth()
    await basicAuth.generateAuthHeader('invalid', 'invalid')

    const response = await baseAPI.get(
      `/v1/organisations/${refNo}`,
      basicAuth.authHeader()
    )

    expect(response.statusCode).to.equal(401)
    const body = /** @type {any} */ (await response.body.json())
    expect(body.message).to.equal('Missing authentication')
  })

  test('rejects the overseas-sites request with incorrect basic auth credentials @basicAuthInvalidCredentials', async () => {
    const basicAuth = new BasicAuth()
    await basicAuth.generateAuthHeader('invalid', 'invalid')

    const response = await baseAPI.get(
      OVERSEAS_SITES_PATH,
      basicAuth.authHeader()
    )

    expect(response.statusCode).to.equal(401)
    const body = /** @type {any} */ (await response.body.json())
    expect(body.message).to.equal('Missing authentication')
  })
})
