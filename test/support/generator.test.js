import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { Registration } from './generator.js'

describe('registration', () => {
  it('sits at the address it is given, whose postcode keys its site', () => {
    const registration = new Registration(
      '500001',
      'ref',
      '1 Mill Lane',
      'AB1 2CD',
      'Reading'
    )
    assert.equal(registration.postcode, 'AB1 2CD')
    assert.equal(registration.address, '1 Mill Lane,Reading,AB1 2CD')
  })

  it('draws an address when given none', () => {
    const registration = new Registration('500001', 'ref')
    assert.ok(registration.postcode)
    assert.ok(registration.address.endsWith(`,${registration.postcode}`))
    assert.equal(registration.address.split(',').length, 3)
  })
})
