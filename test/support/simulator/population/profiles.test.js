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
      perReportingPeriod: 3,
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
    dueDay: 21,
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
        archetype.reporting
      near(onTime + lateWithin7 + lateWithin30 + lateBeyond30, 1, 0.000001)
    }
  })

  it('upload as often as the calibration says, whatever their reliability', () => {
    for (const archetype of Object.values(ARCHETYPES)) {
      assert.equal(
        archetype.uploads.perReportingPeriod,
        FIXTURE.activity.uploads.perReportingPeriod
      )
    }
  })

  it('run from most to least reliable in the order they are declared', () => {
    const onTimeShares = Object.values(ARCHETYPES).map(
      (archetype) => archetype.reporting.onTime
    )

    assert.deepEqual(
      onTimeShares,
      [...onTimeShares].sort((a, b) => b - a)
    )
  })

  it('keep every rate a probability, on the calibration this repository ships', () => {
    const rates = Object.values(buildArchetypes(DEFAULT_CALIBRATION)).flatMap(
      ({ reporting, uploads, prn, weekendChance }) => [
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
      /rejectionRate.*not a probability.*0\.417 or under/
    )
  })

  /**
   * The rates that go right are spread by scaling their failure side, so those
   * have a floor rather than a ceiling. A measured producer acceptance below it
   * is an ordinary figure to find in an overlay, so the refusal has to name the
   * bound it wants rather than only the value it reached.
   */
  it('refuse a calibration whose good rate cannot be bettered', () => {
    assert.throws(
      () =>
        buildArchetypes({
          ...FIXTURE,
          activity: {
            ...FIXTURE.activity,
            prn: { ...FIXTURE.activity.prn, producerAcceptRate: 0.55 }
          }
        }),
      /producerAcceptRate.*not a probability.*0\.583 or over/
    )
  })

  it('refuse a calibration whose lateness spreads past every return', () => {
    assert.throws(
      () =>
        buildArchetypes({
          ...FIXTURE,
          punctuality: {
            ...FIXTURE.punctuality,
            onTime: 0.55,
            lateWithin7: 0.2,
            lateWithin30: 0.15,
            lateBeyond30: 0.1
          }
        }),
      /punctuality.*not a probability/
    )
  })
})

/**
 * The claim the spread exists to make is that the `production` mix averages
 * back to the calibration exactly, and that is arithmetic over three numbers,
 * not a property of a sampled population. Drawing 4000 operators and asserting
 * the mean within a tolerance cannot tell an exact spread from a nearly-right
 * one: widening the tardy factor from 2.4 to 2.6 still lands inside it.
 */
describe('spreading a calibration across the archetypes', () => {
  const mixMean = (read) =>
    Object.entries(PROFILE_MIXES.production).reduce(
      (total, [name, share]) => total + share * read(ARCHETYPES[name]),
      0
    )

  const exactly = (actual, expected, of) =>
    assert.ok(
      Math.abs(actual - expected) < 1e-12,
      `the mix averages ${of} to ${actual}, not to the calibrated ${expected}`
    )

  /**
   * @type {[
   *   string,
   *   (archetype: import('./profiles.js').Archetypes[string]) => number,
   *   (calibration: typeof FIXTURE) => number
   * ][]}
   */
  const spreadRates = [
    [
      'missedReturnRate',
      (a) => a.reporting.missedReturnRate,
      (c) => c.activity.missedReturnRate
    ],
    [
      'restatementRate',
      (a) => a.reporting.restatementRate,
      (c) => c.activity.restatementRate
    ],
    [
      'rejectionRate',
      (a) => a.uploads.rejectionRate,
      (c) => c.activity.uploads.rejectionRate
    ],
    [
      'fatalShare',
      (a) => a.uploads.fatalShare,
      (c) => c.activity.uploads.fatalShare
    ],
    [
      'abandonRate',
      (a) => a.uploads.abandonRate,
      (c) => c.activity.uploads.abandonRate
    ],
    ['deleteRate', (a) => a.prn.deleteRate, (c) => c.activity.prn.deleteRate],
    [
      'discardRate',
      (a) => a.prn.discardRate,
      (c) => c.activity.prn.discardRate
    ],
    ['cancelRate', (a) => a.prn.cancelRate, (c) => c.activity.prn.cancelRate],
    [
      'producerAcceptRate',
      (a) => a.prn.producerAcceptRate,
      (c) => c.activity.prn.producerAcceptRate
    ],
    [
      'sameMonthAcceptanceShare',
      (a) => a.prn.sameMonthAcceptanceShare,
      (c) => c.activity.prn.sameMonthAcceptanceShare
    ],
    ['onTime', (a) => a.reporting.onTime, (c) => c.punctuality.onTime],
    [
      'lateWithin7',
      (a) => a.reporting.lateWithin7,
      (c) => c.punctuality.lateWithin7
    ],
    [
      'lateWithin30',
      (a) => a.reporting.lateWithin30,
      (c) => c.punctuality.lateWithin30
    ],
    [
      'lateBeyond30',
      (a) => a.reporting.lateBeyond30,
      (c) => c.punctuality.lateBeyond30
    ]
  ]

  for (const [name, fromArchetype, fromCalibration] of spreadRates) {
    it(`averages ${name} back to the calibration`, () => {
      exactly(mixMean(fromArchetype), fromCalibration(FIXTURE), name)
    })
  }

  /**
   * Early filing is a share of the on-time returns rather than of the estate,
   * so the mix has to weight it by how much on-time volume each archetype
   * carries. A plain mix average would come out wrong wherever the archetypes
   * differ on punctuality, which is always.
   */
  it('averages earlyShare back to the calibration, weighted by on-time volume', () => {
    exactly(
      mixMean((a) => a.reporting.onTime * a.reporting.earlyShare) /
        mixMean((a) => a.reporting.onTime),
      FIXTURE.punctuality.earlyShare,
      'earlyShare'
    )
  })

  it('averages weekend working back to the calibrated share of upload volume', () => {
    exactly(
      mixMean((a) => a.weekendChance) * WEEKEND_SHARE_OF_A_WORKING_WEEK,
      FIXTURE.activity.uploads.weekendVolumeShare,
      'weekendVolumeShare'
    )
  })
})

describe('the production profile mix', () => {
  const profiles = populationOf('production')

  it('reproduces the calibrated punctuality of the estate', () => {
    const { onTime, lateWithin7, lateWithin30, lateBeyond30 } =
      FIXTURE.punctuality

    near(
      meanOf(profiles, (p) => p.reporting.onTime),
      onTime,
      0.02
    )
    near(
      meanOf(profiles, (p) => p.reporting.lateWithin7),
      lateWithin7,
      0.02
    )
    near(
      meanOf(profiles, (p) => p.reporting.lateWithin30),
      lateWithin30,
      0.02
    )
    near(
      meanOf(profiles, (p) => p.reporting.lateBeyond30),
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
      (sum, profile) => sum + profile.reporting.onTime,
      0
    )
    const early = profiles.reduce(
      (sum, profile) =>
        sum + profile.reporting.onTime * profile.reporting.earlyShare,
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
      meanOf(punctual, (p) => p.reporting.onTime) >
        meanOf(production, (p) => p.reporting.onTime)
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
      meanOf(chaotic, (p) => p.reporting.onTime) <
        meanOf(production, (p) => p.reporting.onTime)
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
