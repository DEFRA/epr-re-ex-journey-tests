import { test } from '@playwright/test'
import { expect } from 'chai'
import { BaseAPI } from '../apis/base-api.js'
import {
  Accreditation,
  Organisation,
  Registration
} from '../support/generator.js'
import {
  assertAuditLog,
  assertAuditLogs,
  assertLogMessage
} from '../support/docker-log-assertions.js'

async function submit(baseAPI, path, payload) {
  return baseAPI.post(path, JSON.stringify(payload))
}

function expectMessage(response, message) {
  return response.body.json().then((body) => {
    expect(body.message).to.equal(message)
  })
}

test.describe('Raw form-submission ingestion validation @formSubmissionIngestion', () => {
  const baseAPI = new BaseAPI()

  test.describe('Organisation endpoint @formSubmissionOrganisation', () => {
    const path = '/v1/apply/organisation'

    test('succeeds without nations, returning orgId/referenceNumber/orgName @orgSubmitMissingNations', async () => {
      const organisation = new Organisation()
      const payload = organisation.toPayload()
      delete payload.data.main.VcdRNr

      const response = await submit(baseAPI, path, payload)

      expect(response.statusCode).to.equal(200)
      const body = /** @type {any} */ (await response.body.json())
      expect(body.orgId).to.match(/^\d{6}$/)
      expect(body.referenceNumber).to.match(/^[0-9a-f]{24}$/i)
      expect(body.orgName).to.equal(organisation.companyName)

      // Ported from epr-backend-journey-tests' formsubmission.feature: the
      // "Stored organisation data" info log plus two audit trails - one
      // database_insert for the org document, and two email_sent audits (user
      // + regulator confirmation emails, same shape, hence count 2). Both
      // audit checks are emitted by the same request at essentially the same
      // instant, so they're asserted together via assertAuditLogs (a single
      // shared poll) rather than two separate assertAuditLog calls - separate
      // calls would race DockerLogParser's own dedup: a line consumed (and
      // discarded as a non-match) while polling for the first expectation
      // would never reappear for a later call checking the second.
      await assertLogMessage({
        level: 'info',
        eventAction: 'request_success',
        message: `Stored organisation data for orgId: ${body.orgId} and referenceNumber: ${body.referenceNumber}`
      })
      await assertAuditLogs([
        {
          eventCategory: 'database',
          eventAction: 'database_insert',
          contextKeys: ['orgId', 'orgName', 'referenceNumber'],
          count: 1,
          contextValues: [`${body.orgId}`, body.referenceNumber]
        },
        {
          eventCategory: 'email',
          eventAction: 'email_sent',
          contextKeys: ['templateId', 'emailAddress', 'personalisation'],
          count: 2,
          contextValues: [`${body.orgId}`, body.referenceNumber]
        }
      ])
    })

    test('rejects a payload that is not a valid object @orgSubmitInvalidPayload', async () => {
      const response = await submit(baseAPI, path, 'invalid-data')

      expect(response.statusCode).to.equal(400)
      await expectMessage(response, 'Invalid payload')
    })
  })

  test.describe('Registration endpoint @formSubmissionRegistration', () => {
    const path = '/v1/apply/registration'

    test('rejects an invalid organisation ID value @regSubmitInvalidOrgId', async () => {
      const payload = new Registration().toExporterPayload()
      payload.data.main.QnSRcX = 'invalid value'

      const response = await submit(baseAPI, path, payload)

      expect(response.statusCode).to.equal(422)
      await expectMessage(response, 'Could not extract orgId from answers')
    })

    test('returns a 500 for a reference number failing schema validation @regSubmitInvalidRefNoSchema', async () => {
      const registration = new Registration()
      registration.orgId = '500123'
      registration.refNo = '50000'
      const payload = registration.toExporterPayload()

      const response = await submit(baseAPI, path, payload)

      expect(response.statusCode).to.equal(500)
    })

    test('rejects a payload that is not a valid object @regSubmitInvalidPayload', async () => {
      const response = await submit(baseAPI, path, 'invalid-data')

      expect(response.statusCode).to.equal(400)
      await expectMessage(response, 'Invalid payload')
    })

    // Ported from epr-backend-journey-tests' formsubmission.feature: the
    // "Stored registration data" info log plus its database_insert audit -
    // shared handler with the accreditation endpoint below (both routed
    // through registrationAndAccreditationHandler).
    test('creates a registration and emits the expected log/audit trail @regSubmitSuccess', async () => {
      const registration = new Registration()
      const payload = registration.toExporterPayload()

      const response = await submit(baseAPI, path, payload)

      expect(response.statusCode).to.equal(201)
      await assertLogMessage({
        level: 'info',
        eventAction: 'request_success',
        message: `Stored registration data for orgId: ${registration.orgId} and referenceNumber: ${registration.refNo}`
      })
      await assertAuditLog({
        eventCategory: 'database',
        eventAction: 'database_insert',
        contextKeys: ['orgId', 'referenceNumber'],
        count: 1,
        contextValues: [registration.orgId, registration.refNo]
      })
    })
  })

  test.describe('Accreditation endpoint @formSubmissionAccreditation', () => {
    const path = '/v1/apply/accreditation'

    test('rejects an invalid organisation ID value @accSubmitInvalidOrgId', async () => {
      const payload = new Accreditation().toExporterPayload()
      payload.data.main.Ooierc = 'invalid value'

      const response = await submit(baseAPI, path, payload)

      expect(response.statusCode).to.equal(422)
      await expectMessage(response, 'Could not extract orgId from answers')
    })

    test('returns a 500 for a reference number failing schema validation @accSubmitInvalidRefNoSchema', async () => {
      const accreditation = new Accreditation()
      accreditation.refNo = '500000'
      const payload = accreditation.toExporterPayload()

      const response = await submit(baseAPI, path, payload)

      expect(response.statusCode).to.equal(500)
    })

    test('rejects a payload that is not a valid object @accSubmitInvalidPayload', async () => {
      const response = await submit(baseAPI, path, 'invalid-data')

      expect(response.statusCode).to.equal(400)
      await expectMessage(response, 'Invalid payload')
    })

    // Ported from epr-backend-journey-tests' formsubmission.feature: the
    // "Stored accreditation data" info log plus its database_insert audit.
    test('creates an accreditation and emits the expected log/audit trail @accSubmitSuccess', async () => {
      const accreditation = new Accreditation()
      const payload = accreditation.toExporterPayload()

      const response = await submit(baseAPI, path, payload)

      expect(response.statusCode).to.equal(201)
      await assertLogMessage({
        level: 'info',
        eventAction: 'request_success',
        message: `Stored accreditation data for orgId: ${accreditation.orgId} and referenceNumber: ${accreditation.refNo}`
      })
      await assertAuditLog({
        eventCategory: 'database',
        eventAction: 'database_insert',
        contextKeys: ['orgId', 'referenceNumber'],
        count: 1,
        contextValues: [accreditation.orgId, accreditation.refNo]
      })
    })
  })
})
