import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { playwrightArgs } from './playwright-args.js'

describe('playwrightArgs', () => {
  const files = [
    'a.e2e.js',
    'admin/b.e2e.js',
    'admin/c.e2e.js',
    'regulator/d.e2e.js',
    'e.e2e.js'
  ]

  describe('grep', () => {
    const cases = [
      { suite: 'all', december: 'all', expected: [] },
      { suite: 'all', december: 'only', expected: ['--grep', '@decWaste'] },
      {
        suite: 'all',
        december: 'exclude',
        expected: ['--grep-invert', '@decWaste']
      },
      {
        suite: 'e2e',
        december: 'all',
        expected: ['--grep-invert', '@accessibility']
      },
      {
        suite: 'e2e',
        december: 'only',
        expected: ['--grep', '@decWaste', '--grep-invert', '@accessibility']
      },
      {
        suite: 'e2e',
        december: 'exclude',
        expected: ['--grep-invert', '@decWaste|@accessibility']
      },
      {
        suite: 'a11y',
        december: 'exclude',
        expected: ['--grep', '@accessibility']
      }
    ]

    cases.forEach(({ suite, december, expected }) => {
      it(`should select ${suite} with ${december} december scope`, () => {
        assert.deepEqual(playwrightArgs(files, { suite, december }), expected)
      })
    })
  })

  describe('scope', () => {
    it('should not filter files for the whole suite', () => {
      assert.deepEqual(playwrightArgs(files, { scope: 'all' }), [])
    })

    it('should list only the admin specs for the admin scope', () => {
      assert.deepEqual(playwrightArgs(files, { scope: 'admin' }), [
        'specs/admin/b\\.e2e\\.js$',
        'specs/admin/c\\.e2e\\.js$'
      ])
    })

    it('should list the specs outside admin for the frontend scope', () => {
      assert.deepEqual(playwrightArgs(files, { scope: 'frontend' }), [
        'specs/a\\.e2e\\.js$',
        'specs/e\\.e2e\\.js$',
        'specs/regulator/d\\.e2e\\.js$'
      ])
    })

    it('should reject an unknown scope', () => {
      assert.throws(
        () => playwrightArgs(files, { scope: 'nope' }),
        /invalid scope/
      )
    })
  })

  describe('shard', () => {
    it('should deal the whole suite out round-robin', () => {
      assert.deepEqual(playwrightArgs(files, { shard: '2/2' }), [
        'specs/admin/b\\.e2e\\.js$',
        'specs/e\\.e2e\\.js$'
      ])
    })

    it('should deal out only the specs in the scope', () => {
      assert.deepEqual(
        playwrightArgs(files, { scope: 'frontend', shard: '2/2' }),
        ['specs/e\\.e2e\\.js$']
      )
    })

    it('should combine a shard with the grep', () => {
      assert.deepEqual(
        playwrightArgs(files, {
          suite: 'e2e',
          december: 'exclude',
          shard: '1/5'
        }),
        ['specs/a\\.e2e\\.js$', '--grep-invert', '@decWaste|@accessibility']
      )
    })

    it('should reject a malformed shard', () => {
      assert.throws(
        () => playwrightArgs(files, { shard: '4/3' }),
        /invalid shard/
      )
    })
  })
})
