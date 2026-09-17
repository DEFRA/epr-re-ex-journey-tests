import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { allocate, createRandom } from './random.js'

describe('createRandom', () => {
  it('gives the same sequence for the same seed', () => {
    const first = createRandom('a-seed')
    const second = createRandom('a-seed')

    const drawOf = (random) => Array.from({ length: 20 }, () => random.float())

    assert.deepEqual(drawOf(first), drawOf(second))
  })

  it('gives a different sequence for a different seed', () => {
    const drawOf = (seed) => {
      const random = createRandom(seed)
      return Array.from({ length: 20 }, () => random.float())
    }

    assert.notDeepEqual(drawOf('a-seed'), drawOf('another-seed'))
  })

  it('accepts a number as a seed', () => {
    const drawOf = (seed) => createRandom(seed).float()

    assert.equal(drawOf(42), drawOf(42))
    assert.notEqual(drawOf(42), drawOf(43))
  })

  it('draws floats in the unit interval', () => {
    const random = createRandom('range')

    for (let i = 0; i < 1000; i++) {
      const value = random.float()
      assert.ok(value >= 0 && value < 1, `${value} out of range`)
    }
  })

  it('draws integers within the closed range', () => {
    const random = createRandom('ints')
    const seen = new Set()

    for (let i = 0; i < 1000; i++) {
      const value = random.int(3, 7)
      assert.ok(Number.isInteger(value))
      assert.ok(value >= 3 && value <= 7, `${value} out of range`)
      seen.add(value)
    }

    assert.deepEqual([...seen].sort(), [3, 4, 5, 6, 7])
  })

  it('shuffles without losing or duplicating members', () => {
    const source = Array.from({ length: 50 }, (_, index) => index)
    const shuffled = createRandom('shuffle').shuffle(source)

    assert.notDeepEqual(shuffled, source)
    assert.deepEqual(
      [...shuffled].sort((a, b) => a - b),
      source
    )
  })

  it('leaves the array it shuffles alone', () => {
    const source = [1, 2, 3, 4, 5, 6, 7, 8]
    createRandom('shuffle').shuffle(source)

    assert.deepEqual(source, [1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('picks from weighted entries in proportion', () => {
    const random = createRandom('weighted')
    const counts = { red: 0, blue: 0 }

    for (let i = 0; i < 4000; i++) {
      counts[random.weighted({ red: 3, blue: 1 })]++
    }

    assert.ok(Math.abs(counts.red / 4000 - 0.75) < 0.03)
  })
})

describe('allocate', () => {
  it('hands out exactly the requested number of members', () => {
    const drawn = allocate({ a: 2, b: 1 }, 30, createRandom('allocate'))

    assert.equal(drawn.length, 30)
  })

  it('matches the distribution proportions', () => {
    const drawn = allocate(
      { a: 145, b: 129, c: 19 },
      293,
      createRandom('allocate')
    )
    const count = (value) => drawn.filter((member) => member === value).length

    assert.equal(count('a'), 145)
    assert.equal(count('b'), 129)
    assert.equal(count('c'), 19)
  })

  it('scales the proportions down, still filling the whole run', () => {
    const drawn = allocate(
      { a: 145, b: 129, c: 19 },
      30,
      createRandom('allocate')
    )
    const count = (value) => drawn.filter((member) => member === value).length

    assert.equal(drawn.length, 30)
    assert.ok(Math.abs(count('a') - 14.8) <= 1)
    assert.ok(Math.abs(count('b') - 13.2) <= 1)
    assert.ok(count('c') >= 1)
  })

  it('shuffles, so allocation order carries no signal', () => {
    const drawn = allocate({ a: 1, b: 1 }, 40, createRandom('allocate'))

    assert.notDeepEqual(drawn, [...drawn].sort())
  })

  it('is deterministic for a given seed', () => {
    const drawOf = () =>
      allocate({ a: 5, b: 3, c: 1 }, 100, createRandom('same'))

    assert.deepEqual(drawOf(), drawOf())
  })

  it('returns nothing for a run of nothing', () => {
    assert.deepEqual(allocate({ a: 1 }, 0, createRandom('empty')), [])
  })

  /**
   * A distribution zeroed all the way across has no proportions to allocate on,
   * and dividing by its total reaches every key with a share of nothing. Left
   * alone it throws on an array length, which names neither the calibration nor
   * the block that is empty.
   */
  it('refuses a distribution with no share in it at all', () => {
    assert.throws(
      () => allocate({ a: 0, b: 0 }, 10, createRandom('zeroed')),
      /"a", "b".*no share between them/
    )
  })

  /**
   * A calibration whose counts disagree with each other subtracts its way to a
   * negative share. Saying so beats handing back a plan quietly short of the
   * members that share was meant to carry.
   */
  it('refuses a share below nothing', () => {
    assert.throws(
      () => allocate({ a: 10, b: -3 }, 20, createRandom('negative')),
      /"b".*-3/
    )
  })
})
