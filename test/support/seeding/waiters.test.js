import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { fundsGeneralNote } from './waiters.js'

describe('whether a balance funds a general note', () => {
  const accreditationId = 'acc-1'

  it('is not funded while the service holds no balance for the accreditation', () => {
    assert.equal(fundsGeneralNote({}, accreditationId, 1), false)
  })

  it('is funded from the available amount, as the route sends it', () => {
    const body = {
      [accreditationId]: { amount: '50', availableAmount: '41.5' }
    }
    assert.equal(fundsGeneralNote(body, accreditationId, 41), true)
    assert.equal(fundsGeneralNote(body, accreditationId, 42), false)
  })

  it('is funded only from outside the December portion where the service marks one', () => {
    const body = {
      [accreditationId]: {
        amount: '50',
        availableAmount: '41.5',
        nonDecemberAvailableAmount: '10'
      }
    }
    assert.equal(fundsGeneralNote(body, accreditationId, 10), true)
    assert.equal(fundsGeneralNote(body, accreditationId, 11), false)
  })
})
