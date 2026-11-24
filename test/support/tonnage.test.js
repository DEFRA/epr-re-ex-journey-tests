import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { formatTonnage, parseTonnage } from './tonnage.js'

describe('formatTonnage', () => {
  it('should render tonnes to two decimal places as the service shows them', () => {
    assert.equal(formatTonnage(0), '0.00')
    assert.equal(formatTonnage(250), '250.00')
    assert.equal(formatTonnage(1234.5), '1,234.50')
  })

  it('should round to the nearest hundredth', () => {
    assert.equal(formatTonnage(370.0444), '370.04')
  })

  it('should give back the amount parseTonnage reads', () => {
    assert.equal(parseTonnage(formatTonnage(1234.5)), 1234.5)
  })
})
