import { randomUUID } from 'node:crypto'
import { test, expect } from '@playwright/test'
import { BaseAPI } from '../apis/base-api.js'
import {
  createAndRegisterDefraIdUser,
  linkDefraIdUser
} from '../support/defra-id-linking.js'
import { defraIdStub } from '../support/defra-id-stub.js'
import {
  summaryLogByIdPath,
  summaryLogUploadPath
} from '../support/seeding/natural-key-paths.js'
import {
  createLinkedOrganisation,
  updateMigratedOrganisation
} from '../support/seeding/organisation.js'
import { registrationStartYear } from '../support/seeding/summary-logs.js'
import { generateNumbers } from '../support/reg-acc-number.js'

// CDP Uploader calls back on the URL the backend gave it when the upload
// started, which carries the backend's signature. A callback made up by anyone
// else has none, so the backend refuses it, however well-formed the payload:
// each one here names a file in the location the route would accept.

const VALID_FROM = '2025-02-02'

/**
 * @param {string} field - the form field the route reads the file from
 * @param {{ s3Bucket: string, s3Key: string }} location
 */
const completedUpload = (field, { s3Bucket, s3Key }) =>
  JSON.stringify({
    uploadStatus: 'ready',
    form: {
      [field]: {
        fileId: randomUUID(),
        filename: 'upload.xlsx',
        fileStatus: 'complete',
        s3Bucket,
        s3Key
      }
    },
    numberOfRejectedFiles: 0
  })

const seedRegistration = async () => {
  const { regNumber } = generateNumbers({
    wasteProcessingType: 'exporter',
    materialSuffix: 'PA'
  })
  const org = await createLinkedOrganisation([
    { wasteProcessingType: 'Exporter', withoutAccreditation: true }
  ])
  const migrated = await updateMigratedOrganisation(org.refNo, [
    {
      regNumber,
      status: 'approved',
      validFrom: VALID_FROM,
      withoutAccreditation: true
    }
  ])
  const user = await createAndRegisterDefraIdUser(migrated.email)
  await linkDefraIdUser(org.refNo, user.userId, migrated.email)

  return {
    refNo: org.refNo,
    registrationId: migrated.registrationIds[0],
    authHeader: defraIdStub.authHeader(user.userId)
  }
}

test.describe('Upload-completed callbacks @uploadCompletedCallback', () => {
  test('An unsigned summary log callback is refused, and stores no summary log @uploadCompletedCallbackSummaryLog', async () => {
    const baseAPI = new BaseAPI()
    const { refNo, registrationId, authHeader } = await seedRegistration()
    const summaryLogId = randomUUID()
    const uploadPath = await summaryLogUploadPath(
      refNo,
      registrationId,
      registrationStartYear(VALID_FROM)
    )

    const callback = await baseAPI.post(
      `${uploadPath}/${summaryLogId}/upload-completed`,
      completedUpload('summaryLogUpload', {
        s3Bucket: 're-ex-summary-logs',
        s3Key: `/organisations/${refNo}/registrations/${registrationId}/${randomUUID()}/${randomUUID()}`
      }),
      { 'content-type': 'application/json' }
    )

    expect(callback.statusCode).toBe(401)
    const summaryLog = await baseAPI.get(
      await summaryLogByIdPath(refNo, registrationId, summaryLogId),
      authHeader
    )
    // The backend answers an id it holds nothing for with the status an
    // upload starts in, so that is all a stored-nothing summary log shows.
    expect(summaryLog.statusCode).toBe(200)
    expect(await summaryLog.body.json()).toStrictEqual({
      status: 'preprocessing'
    })
  })

  test('An unsigned overseas sites import callback is refused @uploadCompletedCallbackOrs', async () => {
    const importId = randomUUID()

    const callback = await new BaseAPI().post(
      `/v1/overseas-sites/imports/${importId}/upload-completed`,
      completedUpload('orsUpload', {
        s3Bucket: 're-ex-overseas-sites',
        s3Key: `/overseas-sites/imports/${importId}/${randomUUID()}/${randomUUID()}`
      }),
      { 'content-type': 'application/json' }
    )

    expect(callback.statusCode).toBe(401)
  })
})
