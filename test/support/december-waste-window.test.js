import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  isDecemberWasteWindowOpen,
  isDecemberWasteWindowOpenFor
} from './december-waste-window.js'

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

describe('isDecemberWasteWindowOpenFor', () => {
  it('is closed before the start in the relevant year', () => {
    assert.equal(
      isDecemberWasteWindowOpenFor(
        2026,
        new Date('2026-11-30T23:59:00Z'),
        '12-01T00:00'
      ),
      false
    )
  })

  it('is open from the start in the relevant year', () => {
    assert.equal(
      isDecemberWasteWindowOpenFor(
        2026,
        new Date('2026-12-01T00:00:00Z'),
        '12-01T00:00'
      ),
      true
    )
  })

  it('stays open through 31 January of the next year', () => {
    assert.equal(
      isDecemberWasteWindowOpenFor(
        2026,
        new Date('2027-01-31T23:59:00Z'),
        '12-01T00:00'
      ),
      true
    )
  })

  it('is closed from 1 February of the next year', () => {
    assert.equal(
      isDecemberWasteWindowOpenFor(
        2026,
        new Date('2027-02-01T00:00:00Z'),
        '12-01T00:00'
      ),
      false
    )
  })

  it("is closed for the next year's accreditation in January", () => {
    assert.equal(
      isDecemberWasteWindowOpenFor(
        2027,
        new Date('2027-01-15T00:00:00Z'),
        '12-01T00:00'
      ),
      false
    )
  })

  it('takes the stack default when no start is configured', () => {
    assert.equal(
      isDecemberWasteWindowOpenFor(2027, new Date('2027-06-01T00:00:00Z'), ''),
      true
    )
  })
})
