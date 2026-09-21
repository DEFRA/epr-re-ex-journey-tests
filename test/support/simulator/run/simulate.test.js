import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { loadCalibration } from '../population/calibration.js'
import { fingerprintOf } from './plan.js'
import { parseSettings, settleSettings } from './simulate.js'

const defaults = { from: '2026-01-01', to: '2026-09-18' }
const calibration = 'abc123'
/** @param {string[]} argv */
const asked = (argv) => ({ ...parseSettings(argv), calibration })

describe('parseSettings', () => {
  it('reads every flag, leaving what was not asked for undefined', () => {
    assert.deepEqual(
      parseSettings([
        '--seed',
        'run-42',
        '--scale',
        '0.1',
        '--from',
        '2026-02-01',
        '--to',
        '2026-03-01',
        '--profile-mix',
        'production',
        '--concurrency',
        '6',
        '--dir',
        'runs/here'
      ]),
      {
        seed: 'run-42',
        scale: 0.1,
        from: '2026-02-01',
        to: '2026-03-01',
        profileMix: 'production',
        concurrency: 6,
        dir: 'runs/here'
      }
    )
    assert.deepEqual(parseSettings([]), {
      seed: undefined,
      scale: undefined,
      from: undefined,
      to: undefined,
      profileMix: undefined,
      concurrency: undefined,
      dir: undefined
    })
  })

  it('refuses a period that is not made of real ISO dates', () => {
    assert.throws(() => parseSettings(['--from', '18/09/2026']), /--from must/)
    assert.throws(() => parseSettings(['--to', '2026-9-1']), /--to must/)
    assert.throws(() => parseSettings(['--to', '2026-13-45']), /--to must/)
  })

  it('refuses a scale or concurrency that is not a number above zero', () => {
    assert.throws(() => parseSettings(['--scale', '0']), /--scale must be/)
    assert.throws(() => parseSettings(['--scale', 'lots']), /--scale must be/)
    assert.throws(
      () => parseSettings(['--concurrency', '2.5']),
      /--concurrency must be a whole number/
    )
  })
})

describe('settleSettings', () => {
  const saved = {
    seed: 'run-42',
    scale: 0.1,
    profileMix: 'production',
    from: '2026-01-01',
    to: '2026-06-30',
    calibration
  }

  it('fills a fresh run from the defaults, under the calibration in force', () => {
    assert.deepEqual(
      settleSettings(asked(['--scale', '0.1']), null, defaults),
      {
        seed: 'pepr',
        scale: 0.1,
        profileMix: 'production',
        from: '2026-01-01',
        to: '2026-09-18',
        calibration
      }
    )
  })

  it('resumes a run as it was planned', () => {
    assert.deepEqual(settleSettings(asked([]), saved, defaults), saved)
    assert.deepEqual(
      settleSettings(
        asked(['--seed', 'run-42', '--concurrency', '2']),
        saved,
        defaults
      ),
      saved
    )
  })

  it('refuses to resume with a setting the run was not planned with', () => {
    assert.throws(
      () => settleSettings(asked(['--scale', '0.2']), saved, defaults),
      /planned with scale 0\.1/
    )
    assert.throws(
      () => settleSettings(asked(['--to', '2026-09-18']), saved, defaults),
      /planned with to "2026-06-30"/
    )
  })

  it('refuses to resume under another calibration', () => {
    assert.throws(
      () =>
        settleSettings(
          { ...asked([]), calibration: 'def456' },
          saved,
          defaults
        ),
      /planned with calibration "abc123"/
    )
  })
})

describe('fingerprintOf', () => {
  it('tells calibrations apart by what they plan', () => {
    const base = loadCalibration({})
    const priced = {
      ...base,
      activity: {
        ...base.activity,
        prnPricePerTonne: { ...base.activity.prnPricePerTonne, PA: 999 }
      }
    }
    assert.equal(fingerprintOf(base), fingerprintOf(loadCalibration({})))
    assert.notEqual(fingerprintOf(base), fingerprintOf(priced))
  })
})
