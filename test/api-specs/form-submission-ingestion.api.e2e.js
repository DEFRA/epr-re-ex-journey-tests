import { expect } from 'chai'
import { BaseAPI } from '../apis/base-api.js'
import {
  Accreditation,
  Organisation,
  Registration
} from '../support/generator.js'

async function submit(baseAPI, path, payload) {
  return baseAPI.post(path, JSON.stringify(payload))
}

function expectMessage(response, message) {
  return response.body.json().then((body) => {
    expect(body.message).to.equal(message)
  })
}

describe('Raw form-submission ingestion validation @formSubmissionIngestion', () => {
  const baseAPI = new BaseAPI()

  describe('Organisation endpoint @formSubmissionOrganisation', () => {
    const path = '/v1/apply/organisation'

    it('rejects a payload without pages metadata @orgSubmitMissingPages', async () => {
      const payload = new Organisation().toPayload()
      delete payload.meta.definition.pages

      const response = await submit(baseAPI, path, payload)

      expect(response.statusCode).to.equal(422)
      await expectMessage(response, 'Could not extract email from answers')
    })

    it('rejects a payload without data @orgSubmitMissingData', async () => {
      const payload = new Organisation().toPayload()
      delete payload.data

      const response = await submit(baseAPI, path, payload)

      expect(response.statusCode).to.equal(422)
      await expectMessage(response, 'Could not extract email from answers')
    })

    it('succeeds without nations, returning orgId/referenceNumber/orgName @orgSubmitMissingNations', async () => {
      const organisation = new Organisation()
      const payload = organisation.toPayload()
      delete payload.data.main.VcdRNr

      const response = await submit(baseAPI, path, payload)

      expect(response.statusCode).to.equal(200)
      const body = await response.body.json()
      expect(body.orgId).to.match(/^\d{6}$/)
      expect(body.referenceNumber).to.match(/^[0-9a-f]{24}$/i)
      expect(body.orgName).to.equal(organisation.companyName)
    })

    it('rejects a payload without email @orgSubmitMissingEmail', async () => {
      const payload = new Organisation().toPayload()
      delete payload.data.main.aSoxDO

      const response = await submit(baseAPI, path, payload)

      expect(response.statusCode).to.equal(422)
      await expectMessage(response, 'Could not extract email from answers')
    })

    it('rejects a payload without organisation name @orgSubmitMissingOrgName', async () => {
      const payload = new Organisation().toPayload()
      delete payload.data.main.RUKDyH

      const response = await submit(baseAPI, path, payload)

      expect(response.statusCode).to.equal(422)
      await expectMessage(
        response,
        'Could not extract organisation name from answers'
      )
    })

    it('rejects a missing payload @orgSubmitNoPayload', async () => {
      const response = await submit(baseAPI, path, null)

      expect(response.statusCode).to.equal(400)
      await expectMessage(response, 'Invalid payload')
    })

    it('rejects a payload that is not a valid object @orgSubmitInvalidPayload', async () => {
      const response = await submit(baseAPI, path, 'invalid-data')

      expect(response.statusCode).to.equal(400)
      await expectMessage(response, 'Invalid payload')
    })
  })

  describe('Registration endpoint @formSubmissionRegistration', () => {
    const path = '/v1/apply/registration'

    it('rejects a payload without data @regSubmitMissingData', async () => {
      const payload = new Registration().toExporterPayload()
      delete payload.data

      const response = await submit(baseAPI, path, payload)

      expect(response.statusCode).to.equal(422)
      await expectMessage(response, 'Could not extract orgId from answers')
    })

    it('rejects a payload without pages metadata @regSubmitMissingPages', async () => {
      const payload = new Registration().toExporterPayload()
      delete payload.meta.definition.pages

      const response = await submit(baseAPI, path, payload)

      expect(response.statusCode).to.equal(422)
      await expectMessage(response, 'Could not extract orgId from answers')
    })

    it('rejects a payload without organisation ID @regSubmitMissingOrgId', async () => {
      const payload = new Registration().toExporterPayload()
      delete payload.data.main.QnSRcX

      const response = await submit(baseAPI, path, payload)

      expect(response.statusCode).to.equal(422)
      await expectMessage(response, 'Could not extract orgId from answers')
    })

    it('rejects an invalid organisation ID value @regSubmitInvalidOrgId', async () => {
      const payload = new Registration().toExporterPayload()
      payload.data.main.QnSRcX = 'invalid value'

      const response = await submit(baseAPI, path, payload)

      expect(response.statusCode).to.equal(422)
      await expectMessage(response, 'Could not extract orgId from answers')
    })

    it('rejects an organisation ID below the minimum value @regSubmitOrgIdBelowMinimum', async () => {
      const registration = new Registration()
      registration.orgId = '5000'
      registration.refNo = 'abcd1234ef567890abcd1234'
      const payload = registration.toExporterPayload()

      const response = await submit(baseAPI, path, payload)

      expect(response.statusCode).to.equal(422)
      await expectMessage(response, 'Organisation ID must be at least 500000')
    })

    it('rejects a payload without reference number @regSubmitMissingRefNo', async () => {
      const payload = new Registration().toExporterPayload()
      delete payload.data.main.RIXIzA

      const response = await submit(baseAPI, path, payload)

      expect(response.statusCode).to.equal(422)
      await expectMessage(
        response,
        'Could not extract referenceNumber from answers'
      )
    })

    it('returns a 500 for a reference number failing schema validation @regSubmitInvalidRefNoSchema', async () => {
      const registration = new Registration()
      registration.orgId = '500123'
      registration.refNo = '50000'
      const payload = registration.toExporterPayload()

      const response = await submit(baseAPI, path, payload)

      expect(response.statusCode).to.equal(500)
    })

    it('rejects a missing payload @regSubmitNoPayload', async () => {
      const response = await submit(baseAPI, path, null)

      expect(response.statusCode).to.equal(400)
      await expectMessage(response, 'Invalid payload')
    })

    it('rejects a payload that is not a valid object @regSubmitInvalidPayload', async () => {
      const response = await submit(baseAPI, path, 'invalid-data')

      expect(response.statusCode).to.equal(400)
      await expectMessage(response, 'Invalid payload')
    })
  })

  describe('Accreditation endpoint @formSubmissionAccreditation', () => {
    const path = '/v1/apply/accreditation'

    it('rejects a payload without pages metadata @accSubmitMissingPages', async () => {
      const payload = new Accreditation().toExporterPayload()
      delete payload.meta.definition.pages

      const response = await submit(baseAPI, path, payload)

      expect(response.statusCode).to.equal(422)
      await expectMessage(response, 'Could not extract orgId from answers')
    })

    it('rejects a payload without organisation ID @accSubmitMissingOrgId', async () => {
      const payload = new Accreditation().toExporterPayload()
      delete payload.data.main.Ooierc

      const response = await submit(baseAPI, path, payload)

      expect(response.statusCode).to.equal(422)
      await expectMessage(response, 'Could not extract orgId from answers')
    })

    it('rejects an invalid organisation ID value @accSubmitInvalidOrgId', async () => {
      const payload = new Accreditation().toExporterPayload()
      payload.data.main.Ooierc = 'invalid value'

      const response = await submit(baseAPI, path, payload)

      expect(response.statusCode).to.equal(422)
      await expectMessage(response, 'Could not extract orgId from answers')
    })

    it('rejects an organisation ID below the minimum value @accSubmitOrgIdBelowMinimum', async () => {
      const accreditation = new Accreditation()
      accreditation.orgId = '5000'
      accreditation.refNo = 'abcdef123456fedcba654321'
      const payload = accreditation.toExporterPayload()

      const response = await submit(baseAPI, path, payload)

      expect(response.statusCode).to.equal(422)
      await expectMessage(response, 'Organisation ID must be at least 500000')
    })

    it('rejects a payload without reference number @accSubmitMissingRefNo', async () => {
      const payload = new Accreditation().toExporterPayload()
      delete payload.data.main.MyWHms

      const response = await submit(baseAPI, path, payload)

      expect(response.statusCode).to.equal(422)
      await expectMessage(
        response,
        'Could not extract referenceNumber from answers'
      )
    })

    it('returns a 500 for a reference number failing schema validation @accSubmitInvalidRefNoSchema', async () => {
      const accreditation = new Accreditation()
      accreditation.refNo = '500000'
      const payload = accreditation.toExporterPayload()

      const response = await submit(baseAPI, path, payload)

      expect(response.statusCode).to.equal(500)
    })

    it('rejects a missing payload @accSubmitNoPayload', async () => {
      const response = await submit(baseAPI, path, null)

      expect(response.statusCode).to.equal(400)
      await expectMessage(response, 'Invalid payload')
    })

    it('rejects a payload that is not a valid object @accSubmitInvalidPayload', async () => {
      const response = await submit(baseAPI, path, 'invalid-data')

      expect(response.statusCode).to.equal(400)
      await expectMessage(response, 'Invalid payload')
    })
  })
})
