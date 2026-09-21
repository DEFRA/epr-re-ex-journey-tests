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
import {
  createPrn,
  externalAPIAcceptPrn,
  externalAPICancelPrn,
  updatePrnStatus
} from '../../seeding/prns.js'
import { seedReportSubmission } from '../../seeding/reports.js'
import { submitSummaryLogContent } from '../../seeding/summary-logs.js'
import { waitForAvailableBalance } from '../../seeding/waiters.js'
import { generateSummaryLogContent } from '../../spreadsheet/summarylogs-content-generator.js'

export const liveSeeders = {
  createLinkedOrganisation,
  approveMigratedRegistration,
  changeMigratedStatus,
  seedOverseasSites,
  createAndRegisterDefraIdUser,
  linkDefraIdUser,
  signInDefraIdUser,
  generateSummaryLogContent,
  submitSummaryLogContent,
  seedReportSubmission,
  waitForAvailableBalance,
  createPrn,
  updatePrnStatus,
  externalAPIAcceptPrn,
  externalAPICancelPrn
}

/** @typedef {typeof liveSeeders} Seeders */
