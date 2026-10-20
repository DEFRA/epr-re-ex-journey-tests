import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { shardFilePatterns } from './shard.js'

describe('shardFilePatterns', () => {
  const files = [
    'a.e2e.js',
    'admin/b.e2e.js',
    'c.e2e.js',
    'd.e2e.js',
    'e.e2e.js'
  ]

  it('should deal files out round-robin', () => {
    assert.deepEqual(shardFilePatterns(files, '2/3'), [
      'specs/admin/b\\.e2e\\.js$',
      'specs/e\\.e2e\\.js$'
    ])
  })

  it('should cover every file exactly once across the shards', () => {
    const everyShard = [1, 2, 3].flatMap((current) =>
      shardFilePatterns(files, `${current}/3`)
    )

    assert.equal(everyShard.length, files.length)
    assert.equal(new Set(everyShard).size, files.length)
  })

  it('should return no patterns without a shard', () => {
    assert.deepEqual(shardFilePatterns(files, ''), [])
  })

  ;['4/3', '0/3', '1.5/3', '1/2.5', 'abc'].forEach((shard) => {
    it(`should reject the malformed shard ${shard}`, () => {
      assert.throws(() => shardFilePatterns(files, shard), /invalid shard/)
    })
  })
})
