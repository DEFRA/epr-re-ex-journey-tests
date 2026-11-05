import { BaseAPI } from '../../apis/base-api.js'
import { generateAccNumber } from '../reg-acc-number.js'
import { assertSuccessResponse } from '../response-assertions.js'

/**
 * @param {string} registrationNumber
 * @param {number} year
 */
const stubAccreditationPath = (registrationNumber, year) =>
  `/v1/dev/stub-accreditations/${registrationNumber}/${year}`

/**
 * Stores an approved accreditation for a year the REEX database holds none
 * for, as the registration service will supply it.
 *
 * @param {string} registrationNumber
 * @param {number} year
 * @returns {Promise<{ accreditationNumber: string }>}
 */
export async function seedStubAccreditation(registrationNumber, year) {
  const path = stubAccreditationPath(registrationNumber, year)
  const response = await new BaseAPI().put(
    path,
    JSON.stringify({
      accreditationNumber: generateAccNumber({
        wasteProcessingType: 'reprocessor',
        materialSuffix: 'PA',
        year: String(year).slice(-2)
      }),
      prnIssuance: { tonnageBand: 'up_to_500' },
      status: {
        current: 'approved',
        timeline: [{ status: 'approved', at: `${year}-01-01T00:00:00.000Z` }]
      }
    })
  )
  return assertSuccessResponse(response, `PUT ${path}`)
}

/**
 * Removes a stub accreditation. Clearing data is not keyed by registration
 * number, so a spec that seeds one removes it.
 *
 * @param {string} registrationNumber
 * @param {number} year
 */
export async function removeStubAccreditation(registrationNumber, year) {
  const path = stubAccreditationPath(registrationNumber, year)
  await assertSuccessResponse(
    await new BaseAPI().delete(path),
    `DELETE ${path}`
  )
}
