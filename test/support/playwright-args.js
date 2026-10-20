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

/**
 * @param {string} suite
 * @param {string} december
 * @returns {string[]}
 */
const grepFlags = (suite, december) => {
  if (suite === 'a11y') {
    return ['--grep', ACCESSIBILITY_TAG]
  }

  const excluded = suite === 'e2e' ? [ACCESSIBILITY_TAG] : []

  if (december === 'only') {
    return [
      '--grep',
      DECEMBER_TAG,
      ...(excluded.length ? ['--grep-invert', excluded.join('|')] : [])
    ]
  }

  const invert = december === 'exclude' ? [DECEMBER_TAG, ...excluded] : excluded

  return invert.length ? ['--grep-invert', invert.join('|')] : []
}

/**
 * @param {string[]} files spec paths relative to test/specs
 * @param {{ scope?: string, suite?: string, december?: string, shard?: string }} selection
 * @returns {string[]} arguments for `playwright test`
 */
export const playwrightArgs = (
  files,
  { scope = 'all', suite = 'all', december = 'all', shard = '' }
) => [...fileFilters(files, scope, shard), ...grepFlags(suite, december)]
