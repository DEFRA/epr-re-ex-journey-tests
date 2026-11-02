import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { isDecemberWasteWindowOpen } from './december-waste-window.js'

describe('isDecemberWasteWindowOpen', () => {
  it('is open from the configured start', () => {
    assert.equal(
      isDecemberWasteWindowOpen(
        new Date('2026-11-03T00:00:00Z'),
        '11-03T00:00'
      ),
      true
    )
  })

  it('is closed before the configured start', () => {
    assert.equal(
      isDecemberWasteWindowOpen(
        new Date('2026-11-02T23:59:00Z'),
        '11-03T00:00'
      ),
      false
    )
  })

  it('reads the start in UK time', () => {
    assert.equal(
      isDecemberWasteWindowOpen(
        new Date('2026-07-01T23:30:00Z'),
        '07-02T00:00'
      ),
      true
    )
  })

  it('takes the stack default when no start is configured', () => {
    assert.equal(
      isDecemberWasteWindowOpen(new Date('2026-06-01T00:00:00Z'), ''),
      true
    )
  })
})
