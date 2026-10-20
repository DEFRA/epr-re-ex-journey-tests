const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * @param {string} file spec path relative to test/specs
 * @returns {string} Playwright file filter matching exactly that spec
 */
export const specFilter = (file) => `specs/${escapeRegExp(file)}$`

/**
 * Deals spec files out round-robin so the heavy, alphabetically adjacent
 * files are spread across shards instead of landing together.
 * @param {string[]} files spec paths relative to test/specs
 * @param {string} shard 'current/total', or empty for no sharding
 * @returns {string[]} Playwright file filters for the shard
 */
export const shardFilePatterns = (files, shard) => {
  if (!shard) {
    return []
  }

  const [current, total] = shard.split('/').map(Number)

  if (!(current >= 1 && current <= total)) {
    throw new Error(`invalid shard: ${shard}`)
  }

  return files
    .toSorted()
    .filter((_, index) => index % total === current - 1)
    .map(specFilter)
}
