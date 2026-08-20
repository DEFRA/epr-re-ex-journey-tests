import { test } from '@playwright/test'
import { expect } from 'chai'
import { AuthClient } from '../support/auth.js'
import { BaseAPI } from '../apis/base-api.js'
import {
  createLinkedOrganisation,
  updateMigratedOrganisation
} from '../support/apicalls.js'
import {
  generateAccNumber,
  generateRegNumber
} from '../support/reg-acc-number.js'

const PAPER = 'Paper or board (R3)'
const PAPER_SUFFIX = 'PA'
const VALID_FROM = '2026-01-01'

function registrationDetailsPath(refNo, registrationId) {
  return `/v1/admin/organisations/${refNo}/registrations/${registrationId}`
}

async function approvedReprocessor({ withoutAccreditation = false } = {}) {
  const org = await createLinkedOrganisation([
    {
      wasteProcessingType: 'Reprocessor',
      material: PAPER,
      withoutAccreditation
    }
  ])

  const numberOptions = {
    wasteProcessingType: 'reprocessor',
    materialSuffix: PAPER_SUFFIX,
    orgId: String(org.orgId)
  }

  const migrated = await updateMigratedOrganisation(
    org.refNo,
    [
      {
        reprocessingType: 'input',
        regNumber: generateRegNumber(numberOptions),
        accNumber: generateAccNumber(numberOptions),
        status: 'approved',
        withoutAccreditation
      }
    ],
    undefined,
    VALID_FROM
  )

  return {
    refNo: org.refNo,
    registrationId: migrated.registrationIds[0],
    registrationNumber: generateRegNumber(numberOptions),
    accreditationNumber: generateAccNumber(numberOptions)
  }
}

test.describe('Registration accredited periods @registrationAccreditedPeriods', () => {
  const baseAPI = new BaseAPI()
  const authClient = new AuthClient()

  test.beforeAll(async () => {
    await authClient.authenticate()
  })

  test('lists the numbered accreditation a registration holds @accreditedPeriodsHappyPath', async () => {
    const { refNo, registrationId, registrationNumber, accreditationNumber } =
      await approvedReprocessor()

    const response = await baseAPI.get(
      registrationDetailsPath(refNo, registrationId),
      authClient.authHeader()
    )

    expect(response.statusCode).to.equal(200)
    const body = /** @type {any} */ (await response.body.json())
    expect(body.registration.id).to.equal(registrationId)
    expect(body.registration.registrationNumber).to.equal(registrationNumber)
    expect(body.registration.status).to.equal('approved')
    expect(body.registration.processingType).to.equal('reprocessor - input')
    expect(body.accreditations).to.have.lengthOf(1)
    expect(body.accreditations[0].accreditationNumber).to.equal(
      accreditationNumber
    )
    expect(body.accreditations[0].status).to.equal('approved')
    expect(body.accreditations[0].validFrom).to.equal(VALID_FROM)
    expect(body.accreditations[0].validTo).to.be.a('string')
  })

  test('returns no accredited periods for a registration that holds none @accreditedPeriodsNone', async () => {
    const { refNo, registrationId } = await approvedReprocessor({
      withoutAccreditation: true
    })

    const response = await baseAPI.get(
      registrationDetailsPath(refNo, registrationId),
      authClient.authHeader()
    )

    expect(response.statusCode).to.equal(200)
    const body = /** @type {any} */ (await response.body.json())
    expect(body.accreditations).to.deep.equal([])
  })

  test('returns 404 for a registration the organisation does not hold @accreditedPeriodsUnknownRegistration', async () => {
    const { refNo } = await approvedReprocessor()

    const response = await baseAPI.get(
      registrationDetailsPath(refNo, '68f6a147c117aec8a1ab74ff'),
      authClient.authHeader()
    )

    expect(response.statusCode).to.equal(404)
  })
})
