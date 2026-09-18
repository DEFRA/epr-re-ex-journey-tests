import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import {
  CALIBRATION_PATH_VARIABLE,
  DEFAULT_CALIBRATION,
  loadCalibration
} from './calibration.js'

const directory = mkdtempSync(join(tmpdir(), 'calibration-'))

const withOverlay = (contents) => {
  const path = join(
    directory,
    `overlay-${Math.random().toString(36).slice(2)}.json`
  )
  writeFileSync(
    path,
    typeof contents === 'string' ? contents : JSON.stringify(contents)
  )
  return { [CALIBRATION_PATH_VARIABLE]: path }
}

describe('loadCalibration', () => {
  it('gives the shipped defaults where no overlay is named', () => {
    assert.equal(loadCalibration({}), DEFAULT_CALIBRATION)
  })

  it('lays an overlay over the defaults without disturbing the rest', () => {
    const calibration = loadCalibration(
      withOverlay({ activity: { uploads: { rejectionRate: 0.42 } } })
    )

    assert.equal(calibration.activity.uploads.rejectionRate, 0.42)
    assert.equal(
      calibration.activity.uploads.fatalShare,
      DEFAULT_CALIBRATION.activity.uploads.fatalShare
    )
    assert.deepEqual(calibration.register, DEFAULT_CALIBRATION.register)
  })

  /**
   * A calibration with no overlay is the defaults themselves, and one with an
   * overlay still shares every branch the overlay left alone. So a run that
   * wrote through what it was handed would recalibrate every later run in the
   * process, and a planner is pure only until that happens.
   */
  it('hands back a calibration nothing can write through', () => {
    for (const calibration of [
      loadCalibration({}),
      loadCalibration(withOverlay({ activity: { missedReturnRate: 0.9 } }))
    ]) {
      assert.throws(() => {
        calibration.register.organisations = 7
      })
      assert.throws(() => {
        calibration.activity.uploads.rejectionRate = 0.99
      })
    }

    assert.equal(DEFAULT_CALIBRATION.register.organisations, 293)
  })

  /**
   * An overlay that quietly does nothing is the failure this is here to
   * prevent: a run plans on the defaults while whoever wrote the file believes
   * it is calibrated.
   */
  it('refuses a setting the defaults do not carry', () => {
    assert.throws(
      () =>
        loadCalibration(withOverlay({ activity: { missedRetrunRate: 0.9 } })),
      /activity\.missedRetrunRate/
    )
  })

  it('lets an overlay add a monthly tonnage to a worksheet the defaults leave without one', () => {
    const sheet = 'Reprocessed (section 4)'
    assert.equal(
      DEFAULT_CALIBRATION.activity.summaryLogSheets.reprocessorInput[sheet]
        .monthlyTonnage,
      undefined
    )

    const calibration = loadCalibration(
      withOverlay({
        activity: {
          summaryLogSheets: {
            reprocessorInput: { [sheet]: { monthlyTonnage: 12345 } }
          }
        }
      })
    )

    assert.equal(
      calibration.activity.summaryLogSheets.reprocessorInput[sheet]
        .monthlyTonnage,
      12345
    )
    assert.equal(
      calibration.activity.summaryLogSheets.reprocessorInput[sheet].rowShare,
      DEFAULT_CALIBRATION.activity.summaryLogSheets.reprocessorInput[sheet]
        .rowShare
    )
  })

  it('refuses an added monthly tonnage that is not a number', () => {
    assert.throws(
      () =>
        loadCalibration(
          withOverlay({
            activity: {
              summaryLogSheets: {
                reprocessorInput: {
                  'Reprocessed (section 4)': { monthlyTonnage: '12345' }
                }
              }
            }
          })
        ),
      /wrong type/
    )
  })

  it('refuses a misspelt key on a worksheet', () => {
    assert.throws(
      () =>
        loadCalibration(
          withOverlay({
            activity: {
              summaryLogSheets: {
                reprocessorInput: {
                  'Reprocessed (section 4)': { monthlyTonage: 12345 }
                }
              }
            }
          })
        ),
      /Reprocessed \(section 4\)\.monthlyTonage/
    )
  })

  it('refuses a monthly tonnage anywhere but on a worksheet', () => {
    assert.throws(
      () =>
        loadCalibration(
          withOverlay({
            activity: { summaryLogSheets: { monthlyTonnage: 12345 } }
          })
        ),
      /activity\.summaryLogSheets\.monthlyTonnage/
    )
  })

  it('refuses a worksheet the defaults do not name', () => {
    assert.throws(
      () =>
        loadCalibration(
          withOverlay({
            activity: {
              summaryLogSheets: {
                reprocessorInput: {
                  'Reprocesed (section 4)': { monthlyTonnage: 12345 }
                }
              }
            }
          })
        ),
      /Reprocesed \(section 4\)/
    )
  })

  /**
   * JSON may name a key every object inherits, and an `in` check would read
   * that as a setting the defaults carry.
   */
  it('refuses a worksheet named for an inherited property', () => {
    assert.throws(
      () =>
        loadCalibration(
          withOverlay(
            '{"activity":{"summaryLogSheets":{"reprocessorInput":{"__proto__":{"monthlyTonnage":12}}}}}'
          )
        ),
      /__proto__/
    )
  })

  it('refuses a setting given the wrong type', () => {
    assert.throws(
      () =>
        loadCalibration(withOverlay({ activity: { missedReturnRate: '0.9' } })),
      /wrong type/
    )
  })

  it('refuses a setting given the wrong shape', () => {
    assert.throws(
      () => loadCalibration(withOverlay({ activity: { uploads: 0.2 } })),
      /wrong shape/
    )
  })

  it('names the variable when the file it points at will not read', () => {
    assert.throws(
      () =>
        loadCalibration({
          [CALIBRATION_PATH_VARIABLE]: join(directory, 'absent.json')
        }),
      new RegExp(CALIBRATION_PATH_VARIABLE)
    )
  })

  it('refuses a file that is not an object', () => {
    assert.throws(() => loadCalibration(withOverlay('[1, 2]')), /not an object/)
  })
})
