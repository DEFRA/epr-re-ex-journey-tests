/**
 * What each summary log worksheet holds, which the templates and the service
 * decide between them and no calibration can move.
 *
 * A field is named by its template marker, as `PlannedRow.fields` is, so this
 * survives the same field sitting in a different column of each template.
 */

/** @import {Random} from '../population/random.js' */

/**
 * What a row does to its registration's waste balance.
 *
 * @type {{CREDIT: 'credit', DEBIT: 'debit', NONE: 'none'}}
 */
export const CONTRIBUTION = {
  CREDIT: 'credit',
  DEBIT: 'debit',
  NONE: 'none'
}

const round = (value) => Math.round(value * 100) / 100

/**
 * @typedef {Object} Load
 * @property {Record<string, string | number>} fields - cells to pin
 * @property {number} tonnage - what those cells carry, before the service rounds it
 */

/**
 * Weights that carry `tonnage` through a received or exported load.
 *
 * The service recomputes both the net weight and the tonnage from the other
 * weights and rejects the whole upload where either disagrees, so this works
 * forwards from weights it picks and reports the tonnage they produce, rather
 * than pinning a tonnage the arithmetic contradicts.
 *
 * @param {number} tonnage
 * @param {Random} random
 * @returns {Load}
 */
function weighLoad(tonnage, random) {
  const proportion = round(0.3 + random.float() * 0.5)
  const nonTarget = round(5 + random.float() * 5)
  const tare = round(5 + random.float() * 25)
  const pallet = round(5 + random.float() * 5)
  const gross = round(tonnage / proportion + nonTarget + tare + pallet)

  const net = gross - tare - pallet

  return {
    fields: {
      GROSS_WEIGHT: gross,
      TARE_WEIGHT: tare,
      PALLET_WEIGHT: pallet,
      NET_WEIGHT: net,
      BAILING_WIRE_PROTOCOL: 'No',
      WEIGHT_OF_NON_TARGET_MATERIALS: nonTarget,
      RECYCLABLE_PROPORTION_PERCENTAGE: proportion
    },
    tonnage: (net - nonTarget) * proportion
  }
}

/**
 * A load received for reprocessing, credited unless a note was already issued
 * against the waste.
 *
 * @param {number} tonnage
 * @param {Random} random
 * @returns {Load}
 */
function receivedLoad(tonnage, random) {
  const load = weighLoad(tonnage, random)
  return {
    fields: {
      ...load.fields,
      TONNAGE_RECEIVED_FOR_RECYCLING: load.tonnage,
      WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE: 'No'
    },
    tonnage: load.tonnage
  }
}

/**
 * An exported load.
 *
 * What credits the balance is the tonnage exported, or the interim site's
 * tonnage where the row says the waste passed through one, so the interim site
 * flag is pinned as firmly as the tonnage is. Everything received is exported:
 * the workbook reports a share received but unexported, and carrying it here
 * would put tonnage in the plan that never reaches a balance.
 *
 * Whether the load was stopped or refused in transit is drawn at the rate the
 * workbook reports rather than pinned to no. The two are checked before the
 * overseas site is even looked up, so a run that draws them evenly excludes
 * nearly every row it reports and never reaches the site checks at all.
 *
 * @param {number} tonnage
 * @param {Random} random
 * @param {import('../population/calibration.js').Calibration} calibration
 * @returns {Load}
 */
function exportedLoad(tonnage, random, calibration) {
  const load = weighLoad(tonnage, random)
  const outcome = exportOutcome(random, calibration)
  return {
    fields: {
      ...load.fields,
      TONNAGE_RECEIVED_FOR_EXPORT: load.tonnage,
      TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: load.tonnage,
      DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE: 'No',
      WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE: 'No',
      WAS_THE_WASTE_STOPPED: outcome.stopped ? 'Yes' : 'No',
      WAS_THE_WASTE_REFUSED: outcome.refused ? 'Yes' : 'No'
    },
    tonnage: outcome.stopped || outcome.refused ? 0 : load.tonnage
  }
}

/**
 * The product a reprocessed load yields, carrying `tonnage` of UK packaging.
 *
 * The proportion is validated against the product tonnage and the percentage,
 * so it is derived here for the same reason the load weights are. Adding the
 * product weight is what lets the row count at all, and a blank or a leftover
 * dropdown placeholder excludes it as firmly as an explicit no.
 *
 * @param {number} tonnage
 * @param {Random} random
 * @returns {Load}
 */
function reprocessedProduct(tonnage, random) {
  const percentage = round(0.3 + random.float() * 0.5)
  const product = round(tonnage / percentage)
  return {
    fields: {
      PRODUCT_TONNAGE: product,
      UK_PACKAGING_WEIGHT_PERCENTAGE: percentage,
      PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION: product * percentage,
      ADD_PRODUCT_WEIGHT: 'Yes'
    },
    tonnage: product * percentage
  }
}

/**
 * A load leaving the site for somewhere else, which debits where it counts.
 *
 * @param {number} tonnage
 * @returns {Load}
 */
function sentOnLoad(tonnage) {
  return {
    fields: { TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: round(tonnage) },
    tonnage: round(tonnage)
  }
}

/**
 * Whether an exported load was stopped or refused in transit, drawn from the
 * one number so no load can be both.
 *
 * @param {Random} random
 * @param {import('../population/calibration.js').Calibration} calibration
 * @returns {{stopped: boolean, refused: boolean}}
 */
function exportOutcome(random, calibration) {
  const { stoppedShare, refusedShare } = calibration.activity.exportLoadOutcome
  const drawn = random.float()
  return {
    stopped: drawn < stoppedShare,
    refused: drawn >= stoppedShare && drawn < stoppedShare + refusedShare
  }
}

/**
 * Both exporting templates carry a repatriation date, which their generators
 * draw relative to now and which would therefore move under the simulated
 * clock. A load that was neither stopped nor refused was never repatriated, so
 * the cell is empty, which is also what holds it still.
 */
const REPATRIATION_UNNEEDED = { DATE_THE_REFUSED_STOPPED_WASTE_REPATRIATED: '' }

const receivedSheet = {
  contribution: CONTRIBUTION.CREDIT,
  dateFields: { DATE_RECEIVED_FOR_REPROCESSING: 0 },
  load: receivedLoad
}

/**
 * @param {'credit' | 'debit' | 'none'} contribution
 * @returns {import('./rows.js').SheetPlan}
 */
const sentOnSheet = (contribution) => ({
  contribution,
  dateFields: { DATE_LOAD_LEFT_SITE: 0 },
  load: sentOnLoad
})

/**
 * Only four of the thirteen worksheets reach a waste balance at all. The rest are
 * reported and read back but never classified, so planning tonnage into one
 * plans nothing.
 *
 * `dateFields` gives each date marker's offset in days from the row's own day.
 * `monthFields` names the markers a registered-only template takes as a month
 * rather than a day, which the template writes as the first of that month.
 * `fields` pins whatever else the sheet holds still, whether or not the row
 * carries a tonnage.
 */
export const SHEETS = {
  exporter: {
    'Exported (sections 1, 2 and 3)': {
      contribution: CONTRIBUTION.CREDIT,
      // Both the date of export and the date the overseas reprocessor received
      // the load are checked against the accreditation period, so the later of
      // the two is what a row near the end of the window has to keep inside it.
      dateFields: {
        DATE_RECEIVED_FOR_EXPORT: -2,
        DATE_OF_EXPORT: 0,
        DATE_RECEIVED_BY_OSR: 21
      },
      fields: REPATRIATION_UNNEEDED,
      load: exportedLoad
    },
    'Sent on (sections 4 and 5)': sentOnSheet(CONTRIBUTION.NONE)
  },
  reprocessorInput: {
    'Received (sections 1, 2 and 3)': receivedSheet,
    'Reprocessed (section 4)': {
      contribution: CONTRIBUTION.NONE,
      dateFields: { DATE_LOAD_LEFT_SITE: 0 }
    },
    'Sent on (sections 5, 6 and 7)': sentOnSheet(CONTRIBUTION.DEBIT)
  },
  reprocessorOutput: {
    'Received (sections 1 and 2)': {
      contribution: CONTRIBUTION.NONE,
      dateFields: receivedSheet.dateFields
    },
    'Reprocessed (sections 3 and 4)': {
      contribution: CONTRIBUTION.CREDIT,
      dateFields: { DATE_LOAD_LEFT_SITE: 0 },
      load: reprocessedProduct
    },
    'Sent on (sections 5 and 6)': sentOnSheet(CONTRIBUTION.NONE)
  },
  regOnlyExporter: {
    'Received (section 1)': {
      contribution: CONTRIBUTION.NONE,
      monthFields: ['MONTH_RECEIVED_FOR_EXPORT']
    },
    'Exported (sections 2 and 3)': {
      contribution: CONTRIBUTION.NONE,
      dateFields: { DATE_OF_EXPORT: 0 },
      fields: REPATRIATION_UNNEEDED
    },
    'Sent on (section 4)': sentOnSheet(CONTRIBUTION.NONE)
  },
  regOnlyReprocessor: {
    'Received (section 1)': {
      contribution: CONTRIBUTION.NONE,
      monthFields: ['MONTH_RECEIVED_FOR_REPROCESSING']
    },
    'Sent on (section 2)': sentOnSheet(CONTRIBUTION.NONE)
  }
}
