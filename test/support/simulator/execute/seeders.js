/**
 * Everything the executors do against the service, which is what the specs'
 * seeders already do. Bundled so a run can be handed a different set.
 */

import {
  createAndRegisterDefraIdUser,
  linkDefraIdUser,
  signInDefraIdUser
} from '../../defra-id-linking.js'
import {
  approveMigratedRegistration,
  changeMigratedStatus,
  createLinkedOrganisation,
  seedOverseasSites
} from '../../seeding/organisation.js'
import { seedReportSubmission } from '../../seeding/reports.js'
import {
  submitSummaryLog,
  uploadSummaryLog
} from '../../seeding/summary-logs.js'
import { waitForSummaryLogStatus } from '../../seeding/waiters.js'
import { generateSpreadsheetData } from '../../spreadsheet/summarylogs-spreadsheet-data-generator.js'

export const liveSeeders = {
  createLinkedOrganisation,
  approveMigratedRegistration,
  changeMigratedStatus,
  seedOverseasSites,
  createAndRegisterDefraIdUser,
  linkDefraIdUser,
  signInDefraIdUser,
  generateSpreadsheetData,
  uploadSummaryLog,
  waitForSummaryLogStatus,
  submitSummaryLog,
  seedReportSubmission
}

/** @typedef {typeof liveSeeders} Seeders */
