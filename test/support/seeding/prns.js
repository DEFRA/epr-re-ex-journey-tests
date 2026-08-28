import { BaseAPI } from '../../apis/base-api.js'
import config from '../../config/config.js'
import {
  assertStatus,
  assertSuccessResponseWithoutBody
} from '../response-assertions.js'

/**
 * Creates a PRN against an accreditation, which needs a waste balance the
 * accreditation can draw the tonnage from. The note starts as a draft; the
 * status endpoint moves it on.
 *
 * @param {string} refNo
 * @param {string} registrationId
 * @param {string} accreditationId
 * @param {{Authorization?: string}} defraAuthHeader
 * @param {number} tonnage
 * @returns {Promise<{prnId: string, prnPath: string}>}
 */
export async function createPrn(
  refNo,
  registrationId,
  accreditationId,
  defraAuthHeader,
  tonnage
) {
  const baseAPI = new BaseAPI()
  const path = `/v1/organisations/${refNo}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes`
  const response = await baseAPI.post(
    path,
    JSON.stringify({
      issuedToOrganisation: {
        id: 'testId',
        name: 'Test Organisation Ltd',
        tradingName: 'Trading Name'
      },
      tonnage
    }),
    defraAuthHeader
  )
  const body = await assertStatus(response, 201, `POST ${path}`)

  return { prnId: body.id, prnPath: `${path}/${body.id}` }
}

/**
 * Moves a PRN along its state machine - draft, awaiting_authorisation,
 * awaiting_acceptance - and returns the note as it stands after the move.
 *
 * @param {string} prnPath
 * @param {{Authorization?: string}} defraAuthHeader
 * @param {string} status
 * @returns {Promise<{prnNumber: string}>}
 */
export async function updatePrnStatus(prnPath, defraAuthHeader, status) {
  const baseAPI = new BaseAPI()
  const response = await baseAPI.post(
    `${prnPath}/status`,
    JSON.stringify({ status }),
    defraAuthHeader
  )

  return assertStatus(response, 200, `POST ${prnPath}/status (${status})`)
}

export async function externalAPICancelPrn(prnDetails) {
  await config.cognitoAuth.generateToken()

  const baseAPI = new BaseAPI()
  const response = await baseAPI.post(
    `/v1/packaging-recycling-notes/${prnDetails.prnNumber}/reject`,
    JSON.stringify({ rejectedAt: new Date().toISOString() }),
    config.cognitoAuth.authHeader()
  )

  await assertSuccessResponseWithoutBody(
    response,
    `POST /v1/packaging-recycling-notes/${prnDetails.prnNumber}/reject`
  )
  prnDetails.status = 'Awaiting cancellation'
}

export async function externalAPIAcceptPrn(prnDetails) {
  await config.cognitoAuth.generateToken()

  const baseAPI = new BaseAPI()
  const response = await baseAPI.post(
    `/v1/packaging-recycling-notes/${prnDetails.prnNumber}/accept`,
    JSON.stringify({ acceptedAt: new Date().toISOString() }),
    config.cognitoAuth.authHeader()
  )

  await assertSuccessResponseWithoutBody(
    response,
    `POST /v1/packaging-recycling-notes/${prnDetails.prnNumber}/accept`
  )
  prnDetails.status = 'Accepted'
}
