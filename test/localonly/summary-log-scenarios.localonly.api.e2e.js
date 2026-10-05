import { test, expect } from '@playwright/test'
import { fakerEN_GB as faker } from '@faker-js/faker'
import {
  createAndRegisterDefraIdUser,
  linkDefraIdUser
} from '../support/defra-id-linking.js'
import {
  createLinkedOrganisation,
  seedOverseasSites,
  updateMigratedOrganisation
} from '../support/seeding/organisation.js'
import {
  registrationStartYear,
  uploadAndSubmitSummaryLog
} from '../support/seeding/summary-logs.js'
import { waitForWasteBalance } from '../support/seeding/waiters.js'
import { defraIdStub } from '../support/defra-id-stub.js'
import { generateSpreadsheetData } from '../support/spreadsheet/summarylogs-spreadsheet-data-generator.js'
import { WORKSHEET_CONFIG } from '../support/spreadsheet/spreadsheet-config.js'
import {
  generateRegNumber,
  generateAccNumber
} from '../support/reg-acc-number.js'
import logger from '../support/logger.js'

// Seeds a local stack with one organisation per kind of operator, each with a
// summary log uploaded and submitted, for exploring by hand afterwards.
//
// The rest of the suite submits summary logs through the backend's dev route
// (submitSummaryLogContent), which takes the content as JSON and so leaves no
// workbook behind for the service to offer as a download. These go the way an
// operator does instead - a real workbook through cdp-uploader - trading the
// dev route's speed for a summary log that can be downloaded again.
//
// Like automated-scaling.localonly.api.e2e.js, this lives outside
// test/api-specs and test/specs so it never runs as part of `npm test` /
// `test:local` / `test:github`. Run it deliberately against a local docker
// compose stack:
//
//   GREP='@summaryLogScenarios' npm run test:localonly:grep
//
// playwright.localonly.config.js sets no global teardown, so what this seeds
// stays put. Each scenario logs the organisation it made and the email to sign
// in to epr-frontend with, which opens with the scenario's own prefix
// (accExp, accRepIn, accRepOut, regOnlyExp, regOnlyRep) so that the user list
// on the Defra ID stub's sign-in page says which is which.

const MATERIAL_SUFFIX = 'PA'
const ROWS_PER_WORKSHEET = 10

// The generators stamp both kinds of exporter row with this overseas
// reprocessor ID, which the organisation has to hold a site for.
const EXPORTER_ORS_ID = 100

const EXPORTED_SHEET = 'Exported (sections 1, 2 and 3)'
const EXPORTED_TONNAGE_BASE = 40
const EXPORTED_TONNAGE_STEP = 5

/** @typedef {import('../support/spreadsheet/summarylogs-spreadsheet-data-generator.js').PlannedRow} PlannedRow */

/**
 * @typedef {object} Scenario
 * @property {string} tag
 * @property {string} emailPrefix
 * @property {string} spreadsheetType - the generator's processing type
 * @property {'Exporter' | 'Reprocessor'} wasteProcessingType
 * @property {'input' | 'output'} [reprocessingType]
 * @property {boolean} accredited
 */

/** @type {Record<string, Scenario>} */
const SCENARIOS = {
  'Registered Only Exporter': {
    tag: '@summaryLogScenarioRegOnlyExporter',
    emailPrefix: 'regOnlyExp',
    spreadsheetType: 'regOnlyExporter',
    wasteProcessingType: 'Exporter',
    accredited: false
  },
  'Registered Only Reprocessor': {
    tag: '@summaryLogScenarioRegOnlyReprocessor',
    emailPrefix: 'regOnlyRep',
    spreadsheetType: 'regOnlyReprocessor',
    wasteProcessingType: 'Reprocessor',
    reprocessingType: 'output',
    accredited: false
  },
  'Accredited Exporter': {
    tag: '@summaryLogScenarioExporter',
    emailPrefix: 'accExp',
    spreadsheetType: 'exporter',
    wasteProcessingType: 'Exporter',
    accredited: true
  },
  'Accredited Reprocessor on Input': {
    tag: '@summaryLogScenarioReprocessorInput',
    emailPrefix: 'accRepIn',
    spreadsheetType: 'reprocessorInput',
    wasteProcessingType: 'Reprocessor',
    reprocessingType: 'input',
    accredited: true
  },
  'Accredited Reprocessor on Output': {
    tag: '@summaryLogScenarioReprocessorOutput',
    emailPrefix: 'accRepOut',
    spreadsheetType: 'reprocessorOutput',
    wasteProcessingType: 'Reprocessor',
    reprocessingType: 'output',
    accredited: true
  }
}

/**
 * What a planned exported load pins over its draw.
 *
 * The draw answers nearly every exported load as refused or stopped, and
 * exports between one and five tonnes on each, which between them would leave
 * an exporter with next to no balance. So no load here is refused or stopped,
 * and each exports a tonnage of its own, stepping up from EXPORTED_TONNAGE_BASE
 * and all of it received by the overseas reprocessor directly rather than
 * through an interim site.
 *
 * @param {number} index - the load's place on the worksheet
 * @returns {Record<string, string | number>}
 */
function exportedLoadFields(index) {
  const tonnage = EXPORTED_TONNAGE_BASE + index * EXPORTED_TONNAGE_STEP
  return {
    WAS_THE_WASTE_REFUSED: 'No',
    WAS_THE_WASTE_STOPPED: 'No',
    TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: tonnage,
    DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE: 'No',
    INTERIM_SITE_ID: '',
    TONNAGE_PASSED_INTERIM_SITE_RECEIVED_BY_OSR: '',
    TONNAGE_RECEIVED_BY_OSR: tonnage
  }
}

/**
 * Plans the same rows on every run: each drawn from a seed of its own row id,
 * so a scenario's loads, and the waste balance they add up to, come out the
 * same each time rather than following the generator's random draw. Only the
 * dates move, since the generator draws them relative to today.
 *
 * The draw still answers some rows as having had a PRN issued, which leaves a
 * realistic mix of loads that count towards the balance and loads that do not.
 *
 * @param {string} spreadsheetType
 * @returns {Record<string, PlannedRow[]>}
 */
function planRows(spreadsheetType) {
  return Object.fromEntries(
    Object.entries(WORKSHEET_CONFIG[spreadsheetType]).map(
      ([worksheet, { rowId }]) => [
        worksheet,
        Array.from({ length: ROWS_PER_WORKSHEET }, (_, i) => ({
          rowId: rowId + i,
          seed: rowId + i,
          ...(worksheet === EXPORTED_SHEET
            ? { fields: exportedLoadFields(i) }
            : {})
        }))
      ]
    )
  )
}

test.describe('Local scenarios - Summary Logs uploaded as a workbook @summaryLogScenarios', () => {
  for (const [name, scenario] of Object.entries(SCENARIOS)) {
    test(`uploads and submits a Summary Log for ${name} ${scenario.tag}`, async () => {
      test.setTimeout(5 * 60 * 1000)

      const withoutAccreditation = !scenario.accredited
      // A serial of its own per run, so that running this again adds to what
      // is already seeded rather than writing over the last run's workbook.
      const numberOptions = {
        wasteProcessingType: scenario.spreadsheetType,
        materialSuffix: MATERIAL_SUFFIX,
        serial: faker.string.numeric(4)
      }
      const email = `${scenario.emailPrefix}.${faker.internet.email()}`
      const regNumber = generateRegNumber(numberOptions)
      const accNumber = scenario.accredited
        ? generateAccNumber(numberOptions)
        : undefined

      const org = await createLinkedOrganisation([
        {
          wasteProcessingType: scenario.wasteProcessingType,
          withoutAccreditation
        }
      ])
      const migrated = await updateMigratedOrganisation(org.refNo, [
        {
          ...(scenario.reprocessingType
            ? { reprocessingType: scenario.reprocessingType }
            : {}),
          regNumber,
          ...(accNumber ? { accNumber } : {}),
          status: 'approved',
          email,
          withoutAccreditation
        }
      ])
      const user = await createAndRegisterDefraIdUser(migrated.email)
      await linkDefraIdUser(org.refNo, user.userId, migrated.email)
      if (scenario.wasteProcessingType === 'Exporter') {
        await seedOverseasSites(org.refNo, [0], [EXPORTER_ORS_ID])
      }
      const registrationId = migrated.registrationIds[0]

      const workbook = await generateSpreadsheetData({
        wasteProcessingType: scenario.spreadsheetType,
        rows: planRows(scenario.spreadsheetType),
        materialSuffix: MATERIAL_SUFFIX,
        regNumber,
        accNumber,
        silentLogging: true
      })

      const authHeader = defraIdStub.authHeader(user.userId)
      const summaryLogId = await uploadAndSubmitSummaryLog(
        org.refNo,
        registrationId,
        authHeader,
        workbook,
        registrationStartYear()
      )

      // A registered-only operator holds no accreditation, and so no balance.
      let wasteBalance
      if (scenario.accredited) {
        const accreditationId = migrated.accreditationIds[0]
        const balances = await waitForWasteBalance(
          org.refNo,
          accreditationId,
          authHeader
        )
        wasteBalance = balances[accreditationId]
        expect(wasteBalance.availableAmount).toBeGreaterThan(0)
      }

      logger.info(
        {
          scenario: name,
          signInEmail: migrated.email,
          companyName: org.organisation.companyName,
          orgId: org.orgId,
          refNo: org.refNo,
          registrationId,
          regNumber,
          ...(accNumber
            ? { accreditationId: migrated.accreditationIds[0], accNumber }
            : {}),
          ...(wasteBalance ? { wasteBalance } : {}),
          summaryLogId,
          workbook
        },
        `Seeded ${name} with a submitted Summary Log`
      )
    })
  }
})
