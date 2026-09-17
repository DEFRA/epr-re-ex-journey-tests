import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { DEFAULT_CALIBRATION } from './calibration.js'
import {
  PROFILE_MIXES,
  WEEKEND_SHARE_OF_A_WORKING_WEEK,
  buildArchetypes,
  buildProfile
} from './profiles.js'
import { allocate, createRandom } from './random.js'

/**
 * The calibration these tests are written against. Invented, and deliberately
 * nothing like the register: what is under test is that the production mix
 * averages back to whatever it is handed, so a fixture of its own is what makes
 * that claim mean anything.
 */
const FIXTURE = {
  activity: {
    missedReturnRate: 0.1,
    restatementRate: 0.08,
    uploads: {
      rejectionRate: 0.3,
      fatalShare: 0.2,
      abandonRate: 0.04,
      weekendVolumeShare: 0.04
    },
    prn: {
      deleteRate: 0.05,
      discardRate: 0.02,
      cancelRate: 0.025,
      producerAcceptRate: 0.75,
      sameMonthAcceptanceShare: 0.65
    }
  },
  punctuality: {
    onTime: 0.6,
    lateWithin7: 0.15,
    lateWithin30: 0.15,
    lateBeyond30: 0.1,
    earlyShare: 0.25
  }
}

const ARCHETYPES = buildArchetypes(FIXTURE)

const populationOf = (mix, count = 4000) => {
  const random = createRandom(`profiles-${mix}`)
  return allocate(PROFILE_MIXES[mix], count, random).map((archetype) =>
    buildProfile({ archetypes: ARCHETYPES, archetype, volumeFactor: 1, random })
  )
}

const meanOf = (profiles, read) =>
  profiles.reduce((sum, profile) => sum + read(profile), 0) / profiles.length

const near = (actual, target, tolerance) =>
  assert.ok(
    Math.abs(actual - target) <= tolerance,
    `${actual} is not within ${tolerance} of ${target}`
  )

describe('archetypes', () => {
  it('spend the whole of every return somewhere on the punctuality scale', () => {
    for (const archetype of Object.values(ARCHETYPES)) {
      const { onTime, lateWithin7, lateWithin30, lateBeyond30 } =
        archetype.submission
      near(onTime + lateWithin7 + lateWithin30 + lateBeyond30, 1, 0.000001)
    }
  })

  it('run from most to least reliable in the order they are declared', () => {
    const onTimeShares = Object.values(ARCHETYPES).map(
      (archetype) => archetype.submission.onTime
    )

    assert.deepEqual(
      onTimeShares,
      [...onTimeShares].sort((a, b) => b - a)
    )
  })

  it('keep every rate a probability, on the calibration this repository ships', () => {
    const rates = Object.values(buildArchetypes(DEFAULT_CALIBRATION)).flatMap(
      ({ submission, reporting, uploads, prn, weekendChance }) => [
        ...Object.values(submission),
        ...Object.values(reporting),
        uploads.rejectionRate,
        uploads.fatalShare,
        uploads.abandonRate,
        ...Object.values(prn),
        weekendChance
      ]
    )

    assert.ok(rates.length > 0)
    assert.ok(rates.every((rate) => rate >= 0 && rate <= 1))
  })

  /**
   * The spread multiplies the calibrated rate, so a calibration high enough to
   * put the tardy archetype past certainty has to say so rather than plan a run
   * that quietly draws against an impossible number.
   */
  it('refuse a calibration they cannot spread', () => {
    assert.throws(
      () =>
        buildArchetypes({
          ...FIXTURE,
          activity: {
            ...FIXTURE.activity,
            uploads: { ...FIXTURE.activity.uploads, rejectionRate: 0.5 }
          }
        }),
      /rejectionRate.*not a probability/
    )
  })
})

describe('the production profile mix', () => {
  const profiles = populationOf('production')

  it('reproduces the calibrated punctuality of the estate', () => {
    const { onTime, lateWithin7, lateWithin30, lateBeyond30 } =
      FIXTURE.punctuality

    near(
      meanOf(profiles, (p) => p.submission.onTime),
      onTime,
      0.02
    )
    near(
      meanOf(profiles, (p) => p.submission.lateWithin7),
      lateWithin7,
      0.02
    )
    near(
      meanOf(profiles, (p) => p.submission.lateWithin30),
      lateWithin30,
      0.02
    )
    near(
      meanOf(profiles, (p) => p.submission.lateBeyond30),
      lateBeyond30,
      0.02
    )
  })

  /**
   * Early filing is calibrated as a share of the on-time returns, so the estate
   * figure weights each operator by how many of those it files. Averaging
   * `earlyShare` across operators instead reads high, because the punctual ones
   * file most of the on-time returns and are the earliest.
   */
  it('reproduces the calibrated share of on-time returns filed early', () => {
    const onTime = profiles.reduce(
      (sum, profile) => sum + profile.submission.onTime,
      0
    )
    const early = profiles.reduce(
      (sum, profile) =>
        sum + profile.submission.onTime * profile.submission.earlyShare,
      0
    )

    near(early / onTime, FIXTURE.punctuality.earlyShare, 0.01)
  })

  it('reproduces the calibrated upload defect rates', () => {
    const { rejectionRate, fatalShare, abandonRate } = FIXTURE.activity.uploads

    near(
      meanOf(profiles, (p) => p.uploads.rejectionRate),
      rejectionRate,
      0.01
    )
    near(
      meanOf(profiles, (p) => p.uploads.fatalShare),
      fatalShare,
      0.01
    )
    near(
      meanOf(profiles, (p) => p.uploads.abandonRate),
      abandonRate,
      0.01
    )
  })

  it('reproduces the calibrated rates of missed and restated returns', () => {
    near(
      meanOf(profiles, (p) => p.reporting.missedReturnRate),
      FIXTURE.activity.missedReturnRate,
      0.005
    )
    near(
      meanOf(profiles, (p) => p.reporting.restatementRate),
      FIXTURE.activity.restatementRate,
      0.005
    )
  })

  it('reproduces the calibrated PRN deletion, discard, cancellation and acceptance rates', () => {
    const {
      deleteRate,
      discardRate,
      cancelRate,
      producerAcceptRate,
      sameMonthAcceptanceShare
    } = FIXTURE.activity.prn

    near(
      meanOf(profiles, (p) => p.prn.deleteRate),
      deleteRate,
      0.005
    )
    near(
      meanOf(profiles, (p) => p.prn.discardRate),
      discardRate,
      0.005
    )
    near(
      meanOf(profiles, (p) => p.prn.cancelRate),
      cancelRate,
      0.005
    )
    near(
      meanOf(profiles, (p) => p.prn.producerAcceptRate),
      producerAcceptRate,
      0.01
    )
    near(
      meanOf(profiles, (p) => p.prn.sameMonthAcceptanceShare),
      sameMonthAcceptanceShare,
      0.01
    )
  })

  /**
   * `worksWeekends` is one draw per operator, so this reads a larger estate
   * than the rate assertions above: the tolerance has to be tighter than the
   * gap a wrong spread opens, and at 4000 operators the sampling noise alone is
   * most of that gap.
   */
  it('puts enough operators on weekend work to reproduce the calibrated weekend upload share', () => {
    const weekendWorkers = meanOf(populationOf('production', 20000), (p) =>
      p.worksWeekends ? 1 : 0
    )

    near(
      weekendWorkers * WEEKEND_SHARE_OF_A_WORKING_WEEK,
      FIXTURE.activity.uploads.weekendVolumeShare,
      0.003
    )
  })
})

describe('the other profile mixes', () => {
  it('gives the punctual mix a cleaner estate than production', () => {
    const punctual = populationOf('punctual')
    const production = populationOf('production')

    assert.ok(
      meanOf(punctual, (p) => p.submission.onTime) >
        meanOf(production, (p) => p.submission.onTime)
    )
    assert.ok(
      meanOf(punctual, (p) => p.uploads.rejectionRate) <
        meanOf(production, (p) => p.uploads.rejectionRate)
    )
  })

  it('gives the chaotic mix a messier estate than production', () => {
    const chaotic = populationOf('chaotic')
    const production = populationOf('production')

    assert.ok(
      meanOf(chaotic, (p) => p.submission.onTime) <
        meanOf(production, (p) => p.submission.onTime)
    )
    assert.ok(
      meanOf(chaotic, (p) => p.uploads.abandonRate) >
        meanOf(production, (p) => p.uploads.abandonRate)
    )
  })
})

describe('buildProfile', () => {
  it('carries the volume factor it was handed, jittered but of the same size', () => {
    const random = createRandom('volume')
    const profiles = Array.from({ length: 500 }, () =>
      buildProfile({
        archetypes: ARCHETYPES,
        archetype: 'typical',
        volumeFactor: 4,
        random
      })
    )

    near(
      meanOf(profiles, (p) => p.volumeFactor),
      4,
      0.4
    )
    assert.ok(profiles.every((p) => p.volumeFactor > 0))
    assert.ok(new Set(profiles.map((p) => p.volumeFactor)).size > 100)
  })

  it('refuses an archetype it does not know', () => {
    assert.throws(
      () =>
        buildProfile({
          archetypes: ARCHETYPES,
          archetype: 'diligent',
          volumeFactor: 1,
          random: createRandom('unknown')
        }),
      /diligent/
    )
  })
})
