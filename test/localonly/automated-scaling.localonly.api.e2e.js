import { test } from '@playwright/test'
import { expect } from 'chai'
import {
  createAndRegisterDefraIdUser,
  linkDefraIdUser
} from '../support/defra-id-linking.js'
import {
  createLinkedOrganisation,
  updateMigratedOrganisation
} from '../support/seeding/organisation.js'
import { uploadAndSubmitSummaryLog } from '../support/seeding/summary-logs.js'
import { defraIdStub } from '../support/defra-id-stub.js'
import { generateSpreadsheetData } from '../support/spreadsheet/summarylogs-spreadsheet-data-generator.js'
import {
  generateRegNumber,
  generateAccNumber
} from '../support/reg-acc-number.js'
import { DockerLogParser } from '../support/docker.log.parser.js'
import config from '../config/config.js'
import logger from '../support/logger.js'

// Ported from epr-backend-journey-tests' localonly/automated-scaling.feature.
// That version's two `While` steps (2000 rows up to a max of 6000, then 2000
// rows up to a max of 12000) share one accumulating spreadsheet across both
// steps and have an identical shape, so they collapse here into a single
// 0->12000 loop with no behaviour change.
//
// This intentionally lives outside test/api-specs and test/specs, so it is
// never picked up by playwright.api.config.js or playwright.config.js and
// never runs as part of `npm test` / `test:local` / `test:github` etc. Run it
// deliberately with `npm run test:localonly` against a local docker compose
// stack - like docker-log-assertions.js, it reads `docker logs` for the
// epr-backend container to catch async-worker failures under row-count
// growth, which only makes sense locally (config.testLogs is false against a
// deployed environment).

const REG_NUMBER = generateRegNumber({
  wasteProcessingType: 'reprocessor',
  materialSuffix: 'PA',
  serial: '0090'
})
const ACC_NUMBER = generateAccNumber({
  wasteProcessingType: 'reprocessor',
  materialSuffix: 'PA',
  serial: '0090'
})

const ROWS_PER_UPLOAD = 2000
const MAX_TOTAL_ROWS = 12000

test.describe('Automated scaling - Summary Logs Reprocessor on Input @automatedScaling', () => {
  test('uploads incrementally and creates Waste Records as row counts grow @automatedScalingUpload', async () => {
    test.setTimeout(20 * 60 * 1000)

    const org = await createLinkedOrganisation([
      { wasteProcessingType: 'Reprocessor' }
    ])
    const migrated = await updateMigratedOrganisation(org.refNo, [
      {
        reprocessingType: 'input',
        regNumber: REG_NUMBER,
        accNumber: ACC_NUMBER,
        status: 'approved',
        validFrom: '2025-02-02'
      }
    ])
    const user = await createAndRegisterDefraIdUser(migrated.email)
    await linkDefraIdUser(org.refNo, user.userId, migrated.email)
    const authHeader = defraIdStub.authHeader(user.userId)
    const registrationId = migrated.registrationIds[0]

    const dockerLogParser = new DockerLogParser(
      config.dockerLogParser.containerName
    )

    let filename = null
    for (
      let rowOffset = 0;
      rowOffset < MAX_TOTAL_ROWS;
      rowOffset += ROWS_PER_UPLOAD
    ) {
      const totalRows = rowOffset + ROWS_PER_UPLOAD
      logger.info(
        `Uploading Summary Logs with ${totalRows} rows (per worksheet)`
      )

      filename = await generateSpreadsheetData({
        filename,
        wasteProcessingType: 'reprocessorInput',
        numberOfRows: ROWS_PER_UPLOAD,
        materialSuffix: 'PA',
        accNumber: ACC_NUMBER,
        regNumber: REG_NUMBER,
        rowOffset,
        silentLogging: true
      })

      try {
        await uploadAndSubmitSummaryLog(
          org.refNo,
          registrationId,
          authHeader,
          filename
        )
      } catch (error) {
        if (!config.testLogs) {
          throw error
        }
        const [commandFailedLog] =
          await dockerLogParser.waitForLog('Command failed')
        if (commandFailedLog) {
          expect.fail(
            `Submission failed at ${totalRows} rows (per worksheet), target max rows: ${MAX_TOTAL_ROWS}: ${commandFailedLog.message}`
          )
        }
        throw error
      }
    }
  })
})
