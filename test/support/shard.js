const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * @param {string} file spec path relative to test/specs
 * @returns {string}
 */
export const specFilter = (file) => `specs/${escapeRegExp(file)}$`

/**
 * @param {string[]} files spec paths relative to test/specs
 * @param {string} shard 'current/total', or empty for no sharding
 * @returns {string[]} Playwright file filters for the shard
 */
export const shardFilePatterns = (files, shard) => {
  if (!shard) {
    return []
  }

  const match = /^(\d+)\/(\d+)$/.exec(shard)
  const current = Number(match?.[1])
  const total = Number(match?.[2])

  if (!(current >= 1 && current <= total)) {
    throw new Error(`invalid shard: ${shard}`)
  }

  return files
    .toSorted()
    .filter((_, index) => index % total === current - 1)
    .map(specFilter)
}
