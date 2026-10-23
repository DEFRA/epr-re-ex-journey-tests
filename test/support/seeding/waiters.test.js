import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { fundsGeneralNote } from './waiters.js'

describe('whether a balance funds a general note', () => {
  it('is not funded by an empty balance', () => {
    const balance = { amount: '0', availableAmount: '0' }
    assert.equal(fundsGeneralNote(balance, 1), false)
  })

  it('is funded from the available amount, as the route sends it', () => {
    const balance = { amount: '50', availableAmount: '41.5' }
    assert.equal(fundsGeneralNote(balance, 41), true)
    assert.equal(fundsGeneralNote(balance, 42), false)
  })

  it('is funded only from outside the December portion where the service marks one', () => {
    const balance = {
      amount: '50',
      availableAmount: '41.5',
      nonDecemberAvailableAmount: '10'
    }
    assert.equal(fundsGeneralNote(balance, 10), true)
    assert.equal(fundsGeneralNote(balance, 11), false)
  })
})
