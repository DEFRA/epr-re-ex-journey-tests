import { shardFilePatterns, specFilter } from './shard.js'

const ACCESSIBILITY_TAG = '@accessibility'
const DECEMBER_TAG = '@decWaste'

/** @type {Record<string, (file: string) => boolean>} */
const scopes = {
  all: () => true,
  admin: (file) => file.startsWith('admin/'),
  frontend: (file) => !file.startsWith('admin/')
}

/**
 * @param {string[]} files
 * @param {string} scope
 * @param {string} shard
 * @returns {string[]}
 */
const fileFilters = (files, scope, shard) => {
  const inScope = scopes[scope]

  if (!inScope) {
    throw new Error(`invalid scope: ${scope}`)
  }

  if (scope === 'all' && !shard) {
    return []
  }

  const scoped = files.filter(inScope)
  const filters = shard
    ? shardFilePatterns(scoped, shard)
    : scoped.toSorted().map(specFilter)

  if (filters.length === 0) {
    throw new Error(
      `no specs in the ${scope} scope${shard ? ` for shard ${shard}` : ''}`
    )
  }

  return filters
}

const suites = ['all', 'e2e', 'a11y']
const decemberScopes = ['all', 'only', 'exclude']

/**
 * @param {string[]} tags
 * @returns {string}
 */
const allOf = (tags) =>
  tags.length === 1 ? tags[0] : tags.map((tag) => `(?=.*${tag})`).join('')

/**
 * @param {string} suite
 * @param {string} december
 * @returns {string[]}
 */
const grepFlags = (suite, december) => {
  if (!suites.includes(suite)) {
    throw new Error(`invalid suite for the browser specs: ${suite}`)
  }

  if (!decemberScopes.includes(december)) {
    throw new Error(`invalid december scope: ${december}`)
  }

  const required = [
    ...(december === 'only' ? [DECEMBER_TAG] : []),
    ...(suite === 'a11y' ? [ACCESSIBILITY_TAG] : [])
  ]
  const excluded = [
    ...(december === 'exclude' ? [DECEMBER_TAG] : []),
    ...(suite === 'e2e' ? [ACCESSIBILITY_TAG] : [])
  ]

  return [
    ...(required.length ? ['--grep', allOf(required)] : []),
    ...(excluded.length ? ['--grep-invert', excluded.join('|')] : []),
    // No spec carries the accessibility tag, but callers of the action may
    // still run an a11y leg.
    ...(suite === 'a11y' ? ['--pass-with-no-tests'] : [])
  ]
}

/**
 * Shards deal out spec files before the grep applies, so a selection that only
 * a few files match would leave some shards with no test to run.
 * @param {string} suite
 * @param {string} december
 * @param {string} shard
 */
const assertShardable = (suite, december, shard) => {
  if (shard && (suite !== 'e2e' || december === 'only')) {
    throw new Error(
      `shard needs test-suite e2e without december-scope only, not ${suite} with ${december}`
    )
  }
}

/**
 * @param {string[]} files spec paths relative to test/specs
 * @param {{ scope?: string, suite?: string, december?: string, shard?: string }} selection
 * @returns {string[]} arguments for `playwright test`
 */
export const playwrightArgs = (
  files,
  { scope = 'all', suite = 'all', december = 'all', shard = '' }
) => {
  assertShardable(suite, december, shard)
  return [...fileFilters(files, scope, shard), ...grepFlags(suite, december)]
}
