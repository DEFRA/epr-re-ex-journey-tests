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
        expected: []
      },
      {
        suite: 'e2e',
        december: 'only',
        expected: ['--grep', '@decWaste']
      },
      {
        suite: 'e2e',
        december: 'exclude',
        expected: ['--grep-invert', '@decWaste']
      }
    ]

    cases.forEach(({ suite, december, expected }) => {
      it(`should select ${suite} with ${december} december scope`, () => {
        assert.deepEqual(playwrightArgs(files, { suite, december }), expected)
      })
    })

    ;['a11y', 'api', ''].forEach((suite) => {
      it(`should reject the suite '${suite}' for the browser specs`, () => {
        assert.throws(() => playwrightArgs(files, { suite }), /invalid suite/)
      })
    })

    ;['exlude', ''].forEach((december) => {
      it(`should reject the december scope '${december}'`, () => {
        assert.throws(
          () => playwrightArgs(files, { december }),
          /invalid december scope/
        )
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
      assert.deepEqual(playwrightArgs(files, { suite: 'e2e', shard: '2/2' }), [
        'specs/admin/b\\.e2e\\.js$',
        'specs/e\\.e2e\\.js$'
      ])
    })

    it('should deal out only the specs in the scope', () => {
      assert.deepEqual(
        playwrightArgs(files, {
          scope: 'frontend',
          suite: 'e2e',
          shard: '2/2'
        }),
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
        ['specs/a\\.e2e\\.js$', '--grep-invert', '@decWaste']
      )
    })

    ;['4/3', '0/3', '1.5/3', '1/2.5', 'abc', '2', '/3'].forEach((shard) => {
      it(`should reject the malformed shard ${shard}`, () => {
        assert.throws(
          () => playwrightArgs(files, { suite: 'e2e', shard }),
          /invalid shard/
        )
      })
    })

    it('should fail a shard that selects no specs, rather than run them all', () => {
      assert.throws(
        () =>
          playwrightArgs(files, { scope: 'admin', suite: 'e2e', shard: '3/3' }),
        /no specs/
      )
    })

    ;[
      { suite: 'all', december: 'all' },
      { suite: 'e2e', december: 'only' }
    ].forEach(({ suite, december }) => {
      it(`should reject a shard of ${suite} with ${december} december scope, where a shard can hold no matching test`, () => {
        assert.throws(
          () => playwrightArgs(files, { suite, december, shard: '1/2' }),
          /shard needs test-suite e2e/
        )
      })
    })
  })

  it('should fail a scope that selects no specs, rather than run them all', () => {
    assert.throws(
      () => playwrightArgs(['a.e2e.js'], { scope: 'admin' }),
      /no specs/
    )
  })
})
