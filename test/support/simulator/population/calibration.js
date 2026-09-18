/**
 * The calibration a simulator run is planned against, and the default one.
 *
 * The planners hold no figures of their own: `planPopulation` takes a
 * calibration and reads everything off it. `DEFAULT_CALIBRATION` is built from
 * published sources alone, so a checkout of this repository plans a population
 * shaped like the public register and behaving plausibly. A run that has
 * figures measured against production supplies them as an overlay instead,
 * through `loadCalibration`. An overlay overrides settings the defaults carry
 * and adds the one figure they leave out where no public source gives it, a
 * worksheet's monthly tonnage; see `UNANCHORED`.
 *
 * The register block is the pEPR public register of 10 September 2026, which is
 * published in full at
 * https://www.gov.uk/government/publications/public-register-of-reprocessors-and-exporters-of-uk-packaging-waste.
 * Two of its counts are derived rather than read off. Sites
 * total 148, which is the reprocessor-only organisations plus the ones doing
 * both. Tonnage bands total 369, which is 389 less the 20 registered-only
 * registrations, so a tonnage band belongs to an accreditation rather than to a
 * registration.
 */

import { readFileSync } from 'node:fs'

/** Names the JSON file an overlay is read from. Unset means the defaults alone. */
export const CALIBRATION_PATH_VARIABLE = 'SIMULATOR_CALIBRATION'

/** Registration counts keyed by material suffix, as `test/support/materials.js` spells them. */
const ROWS_BY_TYPE_AND_MATERIAL = {
  exporter: { PL: 93, PA: 47, AL: 32, ST: 21, GR: 9, GO: 2, WO: 1 },
  reprocessor: { PL: 93, GR: 26, GO: 24, WO: 20, PA: 10, AL: 6, ST: 4, FB: 1 }
}

const AGENCY_NATIONS = {
  EA: 'England',
  NIEA: 'Northern Ireland',
  NRW: 'Wales',
  SEPA: 'Scotland'
}

const REGISTER = {
  organisations: 293,
  registrations: 389,

  /** Organisations by what they do: 145 exporter-only, 129 reprocessor-only, 19 both. */
  organisationType: { exporter: 145, reprocessor: 129, both: 19 },

  /** Registration rows per issuing agency. */
  agencyRows: { EA: 295, NIEA: 45, NRW: 26, SEPA: 23 },

  registrationsPerOrganisation: {
    1: 236,
    2: 36,
    3: 12,
    4: 4,
    5: 3,
    6: 1,
    8: 1
  },
  materialsPerOrganisation: { 1: 261, 2: 19, 3: 9, 4: 3, 6: 1 },
  sitesPerReprocessorOrganisation: { 1: 130, 2: 13, 3: 1, 4: 3, 5: 1 },

  rowsByTypeAndMaterial: ROWS_BY_TYPE_AND_MATERIAL,

  accreditationStatus: { approved: 365, none: 20, cancelled: 2, suspended: 2 },

  tonnageBand: {
    'Over 10,000 tonnes': 143,
    'Up to 5,000 tonnes': 102,
    'Up to 500 tonnes': 89,
    'Up to 10,000 tonnes': 35
  },

  /**
   * When a registration went active. 265 of them on the first day of the
   * scheme, and the rest by the month the register dates them to, which thins
   * out from a January tail rather than spreading evenly.
   *
   * These count the 369 rows carrying an active date, so they are a shape
   * rather than a total: a registered-only row has no date to read.
   */
  activeFrom: {
    goLive: '2026-01-01',
    goLiveCount: 265,
    scatteredByMonth: {
      '2026-01': 40,
      '2026-02': 11,
      '2026-03': 8,
      '2026-04': 9,
      '2026-05': 7,
      '2026-06': 15,
      '2026-07': 7,
      '2026-08': 6,
      '2026-09': 1
    }
  },

  /** The whole estate carries two cancelled registrations. */
  cancelledRegistrations: 2
}

/**
 * How much PRN work a tonnage band implies, relative to each other. A
 * judgement: nothing published joins an operator's tonnage band to the number
 * of PRNs it issues.
 *
 * The bands span roughly 20 to 1 in tonnage and these weights only 13 to 1,
 * because a larger operator issues larger PRNs as much as more of them, so PRN
 * count grows with size far more slowly than tonnage does.
 *
 * The planner normalises these against the band distribution so the population
 * mean factor is 1, which keeps the estate total on the calibrated monthly rate
 * whatever the band mix at a given scale.
 */
const TONNAGE_BAND_PRN_WEIGHT = {
  'Up to 500 tonnes': 0.3,
  'Up to 5,000 tonnes': 1,
  'Up to 10,000 tonnes': 2,
  'Over 10,000 tonnes': 4
}

/**
 * Base rates the later planners apply a per-operator profile factor to.
 *
 * The register carries a report date per registration per month, so what can be
 * read off those dates is computed from them and says so. The rest is a
 * nominal placeholder, round enough to read as one: nothing published measures
 * how a spreadsheet upload fares, how often a return is restated, or what
 * becomes of a PRN once it is raised. A run that wants those on real behaviour
 * supplies an overlay measured against production.
 */
const ACTIVITY = {
  /** Waste record rows an accepted summary log upload carries, before the operator's volume factor. Nominal. */
  rowsPerSubmission: {
    exporter: { created: 50, updated: 50 },
    reprocessorInput: { created: 200, updated: 100 },
    reprocessorOutput: { created: 500, updated: 500 },
    /**
     * A registered-but-unaccredited operator reports on a shorter template.
     * A month's worth, as the accredited figures are, whether the calendar
     * sends it monthly or holds it for a quarterly return. Nominal, and low
     * because nothing published says what they report.
     */
    registeredOnly: { created: 20, updated: 10 }
  },

  /**
   * How the accredited reprocessors divide between reporting their input and
   * their output. A judgement: the register names an operator a reprocessor
   * and stops there, so nothing published says which side of its process a
   * registration reports. Even is the neutral reading, and the monthly
   * aggregated workbook's tonnage received and tonnage recycled are close
   * enough to each other to leave it there.
   */
  reprocessorStream: { reprocessorInput: 1, reprocessorOutput: 1 },

  /**
   * What each worksheet of a summary log carries: its share of the rows an
   * upload holds, and the tonnage the whole UK reports through it in a month.
   *
   * The tonnages are the mean of January to June 2026 on the "UK" sheet of the
   * accredited packaging waste monthly aggregated data workbook, 25 August
   * 2026 edition, at
   * https://www.gov.uk/government/statistical-data-sets/packaging-waste-data-reported-by-reprocessors-and-exporters.
   * Its grand totals are per month and per side of the process. July is in
   * the edition and left out: the newest month of a provisional dataset is the
   * one late submissions have yet to reach. A reprocessor's tonnage received
   * for recycling is read as the input stream's and its tonnage recycled as
   * the output stream's, because that is how the two templates divide the same
   * operator's year. Both are the whole reprocessor estate's figure, not one
   * stream's. The service aggregates tonnage received and tonnage sent on
   * from both templates alike, so those figures sit on both templates'
   * worksheets and the row planner hands each template its share. Tonnage
   * recycled is entered on the report rather than read off a worksheet, so
   * the input template's reprocessed worksheet carries no figure.
   *
   * The row shares are a judgement, save that a sent-on share is set near the
   * ratio the workbook gives between tonnage sent on and tonnage received,
   * which holds while a sent-on load is no bigger than any other.
   */
  summaryLogSheets: {
    exporter: {
      'Exported (sections 1, 2 and 3)': {
        rowShare: 0.94,
        monthlyTonnage: 336289
      },
      'Sent on (sections 4 and 5)': { rowShare: 0.06, monthlyTonnage: 22220 }
    },
    reprocessorInput: {
      'Received (sections 1, 2 and 3)': {
        rowShare: 0.6,
        monthlyTonnage: 308213
      },
      'Reprocessed (section 4)': { rowShare: 0.38 },
      'Sent on (sections 5, 6 and 7)': { rowShare: 0.02, monthlyTonnage: 4302 }
    },
    reprocessorOutput: {
      'Received (sections 1 and 2)': {
        rowShare: 0.48,
        monthlyTonnage: 308213
      },
      'Reprocessed (sections 3 and 4)': {
        rowShare: 0.5,
        monthlyTonnage: 307563
      },
      'Sent on (sections 5 and 6)': { rowShare: 0.02, monthlyTonnage: 4302 }
    },
    regOnlyExporter: {
      'Received (section 1)': { rowShare: 0.47 },
      'Exported (sections 2 and 3)': { rowShare: 0.47 },
      'Sent on (section 4)': { rowShare: 0.06 }
    },
    regOnlyReprocessor: {
      'Received (section 1)': { rowShare: 0.98 },
      'Sent on (section 2)': { rowShare: 0.02 }
    }
  },

  /**
   * How often an exported load is stopped or refused in transit, which
   * excludes it from the waste balance. Read off the same edition and months
   * of the workbook as `summaryLogSheets`, as a share of tonnage exported that
   * was stopped, and refused, against tonnage received for exporting. Both
   * are around one load in ten thousand, so a run that draws them evenly
   * excludes nearly everything it reports.
   */
  exportLoadOutcome: { stoppedShare: 0.00017, refusedShare: 0.000032 },

  /**
   * Monthly reports that never arrive. From the register: the share of periods
   * a registration was already active for whose cell is still empty, over the
   * same April to July window as `PUNCTUALITY`, ignoring cancelled
   * accreditations. It reads a report still outstanding at the snapshot as
   * missed, so it is a floor rather than a measurement.
   *
   * Only accredited registrations report monthly; a registered-only one reports
   * quarterly, so its empty monthly cells are cadence rather than a miss. What
   * keeps those out is the active date, which the register gives to
   * accreditations alone. Widen that condition and this measures cadence.
   */
  missedReturnRate: 0.01,

  /** How often an operator reopens a period it has already closed and files again. Nominal. */
  restatementRate: 0.05,

  uploads: {
    /**
     * Summary log uploads a registration makes per reporting period, so per
     * month while accredited and per quarter while registered only. Nominal:
     * an upload answers no calendar, so nothing published counts them.
     */
    perReportingPeriod: 2,
    /** How often a spreadsheet comes back with validation issues. Nominal. */
    rejectionRate: 0.2,
    /** Of those, the share fatal rather than errors on rows. Nominal. */
    fatalShare: 0.1,
    /** How often a saved draft is walked away from rather than submitted. Nominal. */
    abandonRate: 0.05,
    /**
     * The share of upload volume landing on a Saturday or Sunday, from the
     * weekday of each register report date over April to July.
     */
    weekendVolumeShare: 0.035
  },

  /**
   * What a rejected upload is rejected for, by severity. A fatal issue stops
   * the whole upload: a row submitted before and now missing, a workbook the
   * service cannot read, or text where a row's date should be. An error sits
   * on a row: a required cell left blank. Nominal.
   */
  uploadIssueKinds: {
    fatal: { removedRow: 0.9, unreadable: 0.05, badDate: 0.05 },
    error: { blankField: 1 }
  },

  /**
   * PRNs raised a month per accreditation, before the operator's volume factor.
   * Nominal. The monthly aggregated workbook publishes the tonnage PRNs were
   * issued against, not how many notes carried it, and a note has no fixed
   * size, so it cannot answer this.
   */
  prnsPerAccreditationPerMonth: 2,

  /**
   * The share of the tonnage a registration credits to its waste balance that
   * goes out on notes, by processing type. From the "UK" sheet of the
   * accredited packaging waste monthly aggregated data workbook, 25 August
   * 2026 edition, at
   * https://www.gov.uk/government/statistical-data-sets/packaging-waste-data-reported-by-reprocessors-and-exporters:
   * the tonnage of PRNs and PERNs issued over the tonnage recycled
   * (reprocessors) and the tonnage exported for recycling (exporters), March
   * to June 2026. January and February are the scheme's first two months, in
   * which almost nothing was issued, so they would read a start-up lag as a
   * habit.
   */
  prnIssuedShare: { reprocessor: 0.9, exporter: 0.6 },

  /**
   * What a tonne fetches on a note, by material suffix as
   * `test/support/materials.js` spells it: the revenue over the tonnage
   * issued on the "UK" sheet of the same workbook and edition as
   * `prnIssuedShare`, March to June 2026, reprocessors and exporters
   * together. The workbook carries no fibre-based composite row, so FB takes
   * the paper and board price, as a fibre. Nominal for FB alone.
   */
  prnPricePerTonne: {
    AL: 58,
    FB: 5,
    GR: 101,
    GO: 91,
    PA: 5,
    PL: 299,
    ST: 33,
    WO: 13
  },

  /** Nothing published follows a PRN past issue, so all of these are nominal. */
  prn: {
    deleteRate: 0.03,
    discardRate: 0.01,
    cancelRate: 0.01,
    /** How often the producer accepts rather than leaving it sitting. */
    producerAcceptRate: 0.8,
    /** Of those accepted, the share accepted in the month it was issued. */
    sameMonthAcceptanceShare: 0.7
  }
}

/**
 * Report punctuality across the estate, computed from the register's own
 * report dates against the 21st of the month following each period.
 *
 * A report is the per-period aggregation, not the summary log upload that
 * triggers one: an upload answers no calendar, so nothing published measures
 * how punctually an operator uploads.
 *
 * April to July 2026, over the cells that carry a date, so this is the shape of
 * the returns that arrived rather than of the ones that were due. The go-live
 * catch-up of January to March is excluded, because most registrations filed
 * all three of those on a single day in April and would swamp everything after.
 *
 * The profile builder normalises the four, so rounding them separately is safe.
 */
const PUNCTUALITY = {
  /**
   * The day of the month after the period that the shares below are measured
   * against. GOV.UK's guidance for reprocessors and exporters, at
   * https://www.gov.uk/guidance/recording-and-reporting-packaging-waste-reprocessors-and-exporters,
   * says monthly reports "are due by the 21st day of each month" and quarterly
   * ones "before the 21st day of each month following the end of the
   * quarter". The service's own reporting calendar marks the 20th, so a report
   * filed on the 21st reads as on time here and a day late there.
   */
  dueDay: 21,
  onTime: 0.726,
  lateWithin7: 0.095,
  lateWithin30: 0.111,
  lateBeyond30: 0.068,
  /** Of the on-time returns, the share filed more than ten days before the deadline. */
  earlyShare: 0.196
}

/**
 * A calibration is data a run is handed, so these describe its shape rather
 * than the defaults' own keys. A register with one agency in it is a perfectly
 * good calibration.
 *
 * @typedef {Record<string, number>} Counts
 */

/**
 * @typedef {Object} RegisterShape
 * @property {number} organisations
 * @property {number} registrations
 * @property {Counts} organisationType
 * @property {Counts} agencyRows
 * @property {Counts} registrationsPerOrganisation
 * @property {Counts} materialsPerOrganisation
 * @property {Counts} sitesPerReprocessorOrganisation
 * @property {Record<string, Counts>} rowsByTypeAndMaterial
 * @property {Counts} accreditationStatus
 * @property {Counts} tonnageBand
 * @property {{goLive: string, goLiveCount: number, scatteredByMonth: Counts}} activeFrom
 * @property {number} cancelledRegistrations
 */

/**
 * The rates an operator's behaviour profile is spread from. Kept apart from the
 * volume rates because the profile builder reads only these.
 *
 * @typedef {Object} BehaviourRates
 * @property {number} missedReturnRate
 * @property {number} restatementRate
 * @property {{perReportingPeriod: number, rejectionRate: number, fatalShare: number, abandonRate: number, weekendVolumeShare: number}} uploads
 * @property {{deleteRate: number, discardRate: number, cancelRate: number, producerAcceptRate: number, sameMonthAcceptanceShare: number}} prn
 */

/**
 * @typedef {Object} SheetShape
 * @property {number} rowShare - this worksheet's share of an upload's rows
 * @property {number} [monthlyTonnage] - what the whole UK reports through it in a month
 */

/**
 * @typedef {BehaviourRates & {
 *   rowsPerSubmission: Record<string, {created: number, updated: number}>,
 *   reprocessorStream: Counts,
 *   summaryLogSheets: Record<string, Record<string, SheetShape>>,
 *   exportLoadOutcome: {stoppedShare: number, refusedShare: number},
 *   uploadIssueKinds: {fatal: Counts, error: Counts},
 *   prnsPerAccreditationPerMonth: number,
 *   prnIssuedShare: Record<'exporter' | 'reprocessor', number>,
 *   prnPricePerTonne: Counts
 * }} ActivityShape
 */

/**
 * @typedef {Object} PunctualityShape
 * @property {number} dueDay - day of the month after the period the shares are measured against
 * @property {number} onTime
 * @property {number} lateWithin7
 * @property {number} lateWithin30
 * @property {number} lateBeyond30
 * @property {number} earlyShare
 */

/**
 * @typedef {Object} Calibration
 * @property {Record<string, string>} agencyNations
 * @property {RegisterShape} register
 * @property {Counts} tonnageBandPrnWeight
 * @property {ActivityShape} activity
 * @property {PunctualityShape} punctuality
 */

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
const isBranch = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * `loadCalibration` hands back the defaults themselves where no overlay is
 * named, and shares every branch an overlay leaves alone, so a run that wrote
 * through what it was given would recalibrate every later run in the process.
 *
 * @template T
 * @param {T} value
 * @returns {T}
 */
function deepFreeze(value) {
  if (!isBranch(value)) return value

  Object.values(value).forEach(deepFreeze)
  return Object.freeze(value)
}

/** @type {Calibration} */
export const DEFAULT_CALIBRATION = deepFreeze({
  agencyNations: AGENCY_NATIONS,
  register: REGISTER,
  tonnageBandPrnWeight: TONNAGE_BAND_PRN_WEIGHT,
  activity: ACTIVITY,
  punctuality: PUNCTUALITY
})

/**
 * The one setting an overlay may add rather than override: a worksheet's
 * monthly tonnage, a number. The defaults carry it only where the monthly
 * aggregated workbook publishes a figure, and a figure for the other
 * worksheets is exactly what an overlay measured against production is for.
 */
const UNANCHORED = ['activity', 'summaryLogSheets', '*', '*', 'monthlyTonnage']

/** @param {string} at */
const isUnanchored = (at) => {
  const segments = at.split('.')
  return (
    segments.length === UNANCHORED.length &&
    UNANCHORED.every((part, i) => part === '*' || part === segments[i])
  )
}

/**
 * Lay an overlay over the defaults, key by key.
 *
 * An overlay may override a setting the defaults carry, with a value of the
 * same shape, and may add only what `UNANCHORED` names. Any other key is
 * refused: a file that misspells one otherwise plans a run on the defaults
 * while its author believes it is calibrated, which is the whole failure this
 * is here to prevent.
 *
 * @template {Record<string, unknown>} T
 * @param {T} base
 * @param {Record<string, unknown>} overlay
 * @param {string} path
 * @returns {T}
 */
function merge(base, overlay, path) {
  for (const [key, given] of Object.entries(overlay)) {
    const at = `${path}${key}`
    const carried = Object.hasOwn(base, key)
    if (!carried && !isUnanchored(at)) {
      throw new Error(
        `Calibration overlay sets "${at}", which is not a setting`
      )
    }
    const under = base[key]
    if (isBranch(under) !== isBranch(given)) {
      throw new Error(`Calibration overlay gives "${at}" the wrong shape`)
    }
    const wrongType = carried
      ? typeof given !== typeof under
      : typeof given !== 'number'
    if (!isBranch(given) && wrongType) {
      throw new Error(`Calibration overlay gives "${at}" the wrong type`)
    }
    if (typeof given === 'number' && !Number.isFinite(given)) {
      throw new Error(`Calibration overlay gives "${at}" no usable number`)
    }
  }

  return {
    ...base,
    ...Object.fromEntries(
      Object.entries(overlay).map(([key, given]) => {
        const under = base[key]
        return [
          key,
          isBranch(under) && isBranch(given)
            ? merge(under, given, `${path}${key}.`)
            : given
        ]
      })
    )
  }
}

/**
 * The calibration to plan a run against: the defaults, with the overlay named
 * by `SIMULATOR_CALIBRATION` laid over them where that is set.
 *
 * The overlay file is never committed. Read it here, at the edge of a run,
 * rather than inside the planner, so that planning stays pure and a seed
 * replays the same population on a machine that has the file and one that does
 * not.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {Calibration}
 */
export function loadCalibration(env = process.env) {
  const path = env[CALIBRATION_PATH_VARIABLE]
  if (!path) return DEFAULT_CALIBRATION

  let overlay
  try {
    overlay = JSON.parse(readFileSync(path, 'utf8'))
  } catch (cause) {
    throw new Error(
      `Could not read the calibration overlay at ${path} named by ${CALIBRATION_PATH_VARIABLE}`,
      { cause }
    )
  }
  if (!isBranch(overlay)) {
    throw new Error(`The calibration overlay at ${path} is not an object`)
  }

  return deepFreeze(merge(DEFAULT_CALIBRATION, overlay, ''))
}
