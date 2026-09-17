/**
 * Behaviour profiles for simulated operators.
 *
 * An operator's profile is the set of knobs the later planners read to decide
 * what it actually does: when it submits, how often an upload comes back
 * wrong, whether it walks away from one, how it treats its PRNs, and whether
 * it works at the weekend. The planners own the events; this owns the
 * disposition.
 *
 * Three archetypes carry those knobs, and a named mix says how much of the
 * estate is each. The rates on an archetype are flat rather than jittered per
 * operator, because every one of them is already a probability the calendar
 * planner draws against per return, per upload and per PRN, so the variety
 * appears there. What does vary per operator is `volumeFactor`, since two
 * operators in the same tonnage band genuinely differ in size.
 *
 * An archetype holds no rates of its own. It is a spread either side of the
 * calibration it is built from, and the spread is chosen so the `production`
 * mix averages back to that calibration exactly. Replace the calibration and
 * every archetype moves with it, which is what lets a run measured against
 * production behave like production without any figure of its own living here.
 */

/**
 * A weekend worker spreads its uploads over seven days rather than five, so two
 * sevenths of what it files lands at the weekend. That is what turns a share of
 * upload volume into a share of operators.
 */
export const WEEKEND_SHARE_OF_A_WORKING_WEEK = 2 / 7

/**
 * How much more often things go wrong for an archetype than for the estate.
 *
 * Declared most to least reliable, which is the order the archetypes come out
 * in. The three weighted by the `production` mix average to exactly 1, so every
 * calibrated rate is reproduced by construction rather than by tuning, and
 * `profiles.test.js` holds them to it.
 */
const SPREAD = { punctual: 0.3, typical: 1, tardy: 2.4 }

/** How much less of a tardy operator's on-time filing is early. */
const TARDY_EARLY_DEFICIT = 0.8

/** A rejected upload costs a tardy operator an extra go. */
const EXTRA_ATTEMPTS = { punctual: 1, typical: 1, tardy: 2 }

/**
 * @typedef {Object} BehaviourProfile
 * @property {string} archetype - which archetype this operator draws its disposition from
 * @property {number} volumeFactor - how much this operator reports and issues, relative to the estate mean of 1
 * @property {boolean} worksWeekends - whether it uploads and issues on Saturdays and Sundays
 * @property {{onTime: number, earlyShare: number, lateWithin7: number, lateWithin30: number, lateBeyond30: number}} submission
 * @property {{missedReturnRate: number, restatementRate: number}} reporting
 * @property {{rejectionRate: number, fatalShare: number, extraAttemptsWhenRejected: number, abandonRate: number}} uploads
 * @property {{deleteRate: number, discardRate: number, cancelRate: number, producerAcceptRate: number, sameMonthAcceptanceShare: number}} prn
 */

/** @typedef {Record<string, Omit<BehaviourProfile, 'archetype' | 'volumeFactor' | 'worksWeekends'> & {weekendChance: number}>} Archetypes */

function asProbability(value, of) {
  if (!(value >= 0 && value <= 1)) {
    throw new Error(
      `Spreading the calibrated ${of} across the archetypes reaches ${value}, which is not a probability`
    )
  }
  return value
}

/** A rate that rises as an archetype gets less reliable. */
const worse = (rate, factor, of) => asProbability(rate * factor, of)

/** A rate that falls instead, because it is the side that goes right. */
const better = (rate, factor, of) => asProbability(1 - (1 - rate) * factor, of)

/** The calibrated shares are rounded separately and need not sum to one. */
function normalised(punctuality) {
  const { onTime, lateWithin7, lateWithin30, lateBeyond30 } = punctuality
  const total = onTime + lateWithin7 + lateWithin30 + lateBeyond30

  return {
    lateWithin7: lateWithin7 / total,
    lateWithin30: lateWithin30 / total,
    lateBeyond30: lateBeyond30 / total,
    earlyShare: punctuality.earlyShare
  }
}

/**
 * Spread lateness rather than punctuality, so the three late buckets keep the
 * calibrated proportions between them and on-time is whatever is left.
 */
function latenessAt(base, factor) {
  const lateWithin7 = worse(base.lateWithin7, factor, 'lateWithin7')
  const lateWithin30 = worse(base.lateWithin30, factor, 'lateWithin30')
  const lateBeyond30 = worse(base.lateBeyond30, factor, 'lateBeyond30')

  return {
    onTime: asProbability(
      1 - lateWithin7 - lateWithin30 - lateBeyond30,
      'punctuality'
    ),
    lateWithin7,
    lateWithin30,
    lateBeyond30
  }
}

/**
 * Early filing is a share of the on-time returns rather than of the estate, so
 * its spread has to be weighted by on-time volume. A punctual operator files
 * far more of those returns than a tardy one, so it moves the estate figure
 * further per point of spread: its surplus is the tardy deficit scaled by the
 * volume between them. That holds the production mix on the calibrated share
 * whatever the calibration says.
 */
function earlySpread(onTime) {
  const volume = (name) => PROFILE_MIXES.production[name] * onTime[name]

  return {
    punctual: 1 + (TARDY_EARLY_DEFICIT * volume('tardy')) / volume('punctual'),
    typical: 1,
    tardy: 1 - TARDY_EARLY_DEFICIT
  }
}

/**
 * @param {{activity: import('./calibration.js').BehaviourRates, punctuality: import('./calibration.js').PunctualityShape}} calibration
 * @returns {Archetypes}
 */
export function buildArchetypes(calibration) {
  const { activity, punctuality } = calibration
  const base = normalised(punctuality)
  const weekendWorkers =
    activity.uploads.weekendVolumeShare / WEEKEND_SHARE_OF_A_WORKING_WEEK

  const lateness = Object.fromEntries(
    Object.entries(SPREAD).map(([name, factor]) => [
      name,
      latenessAt(base, factor)
    ])
  )
  const early = earlySpread(
    Object.fromEntries(
      Object.entries(lateness).map(([name, at]) => [name, at.onTime])
    )
  )

  return Object.fromEntries(
    Object.entries(SPREAD).map(([name, factor]) => [
      name,
      {
        submission: {
          ...lateness[name],
          earlyShare: asProbability(base.earlyShare * early[name], 'earlyShare')
        },
        reporting: {
          missedReturnRate: worse(
            activity.missedReturnRate,
            factor,
            'missedReturnRate'
          ),
          restatementRate: worse(
            activity.restatementRate,
            factor,
            'restatementRate'
          )
        },
        uploads: {
          rejectionRate: worse(
            activity.uploads.rejectionRate,
            factor,
            'rejectionRate'
          ),
          fatalShare: worse(activity.uploads.fatalShare, factor, 'fatalShare'),
          extraAttemptsWhenRejected: EXTRA_ATTEMPTS[name],
          abandonRate: worse(
            activity.uploads.abandonRate,
            factor,
            'abandonRate'
          )
        },
        prn: {
          deleteRate: worse(activity.prn.deleteRate, factor, 'deleteRate'),
          discardRate: worse(activity.prn.discardRate, factor, 'discardRate'),
          cancelRate: worse(activity.prn.cancelRate, factor, 'cancelRate'),
          producerAcceptRate: better(
            activity.prn.producerAcceptRate,
            factor,
            'producerAcceptRate'
          ),
          sameMonthAcceptanceShare: better(
            activity.prn.sameMonthAcceptanceShare,
            factor,
            'sameMonthAcceptanceShare'
          )
        },
        weekendChance: worse(weekendWorkers, factor, 'weekendVolumeShare')
      }
    ])
  )
}

/**
 * How much of the estate is each archetype. `production` is the calibrated
 * default; `punctual` gives a clean run that exercises the happy path quickly,
 * and `chaotic` leans on the defect, abandonment and cancellation paths.
 */
export const PROFILE_MIXES = {
  production: { punctual: 0.4, typical: 0.4, tardy: 0.2 },
  punctual: { punctual: 1 },
  chaotic: { punctual: 0.1, typical: 0.4, tardy: 0.5 }
}

/** Two operators in one tonnage band still differ in size; this is how far. */
const VOLUME_JITTER = 0.4

/**
 * @param {{archetypes: Archetypes, archetype: string, volumeFactor: number, random: import('./random.js').Random}} operator
 * @returns {BehaviourProfile}
 */
export function buildProfile({ archetypes, archetype, volumeFactor, random }) {
  const source = archetypes[archetype]
  if (!source) {
    throw new Error(
      `Unknown behaviour archetype "${archetype}" — expected one of ${Object.keys(archetypes).join(', ')}`
    )
  }

  const jitter = 1 + (random.float() * 2 - 1) * VOLUME_JITTER

  return {
    archetype,
    volumeFactor: volumeFactor * jitter,
    worksWeekends: random.float() < source.weekendChance,
    submission: { ...source.submission },
    reporting: { ...source.reporting },
    uploads: { ...source.uploads },
    prn: { ...source.prn }
  }
}
