/**
 * A seeded pseudo-random source, so a simulator run replays exactly from its
 * seed. `Math.random` cannot be seeded, and faker, which the rest of the repo
 * generates data with, does not contract its seeded sequence across major
 * versions — a run planned today would stop replaying at the next upgrade. So
 * this is mulberry32 over a string hash.
 */

/**
 * @typedef {Object} Random
 * @property {() => number} float - the next draw in [0, 1)
 * @property {(min: number, max: number) => number} int - a draw in [min, max]
 * @property {<T>(members: readonly T[]) => T[]} shuffle - a shuffled copy
 * @property {(weights: Record<string, number>) => string} weighted - a key drawn in proportion to its weight
 */

function hashSeed(seed) {
  let hash = 0x811c9dc5
  for (const character of String(seed)) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/**
 * @param {string | number} seed
 * @returns {Random}
 */
export function createRandom(seed) {
  let state = hashSeed(seed)

  const float = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let drawn = Math.imul(state ^ (state >>> 15), 1 | state)
    drawn = (drawn + Math.imul(drawn ^ (drawn >>> 7), 61 | drawn)) ^ drawn
    return ((drawn ^ (drawn >>> 14)) >>> 0) / 4294967296
  }

  const int = (min, max) => min + Math.floor(float() * (max - min + 1))

  const shuffle = (members) => {
    const shuffled = [...members]
    for (let index = shuffled.length - 1; index > 0; index--) {
      const swap = int(0, index)
      ;[shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]]
    }
    return shuffled
  }

  const weighted = (weights) => {
    const entries = Object.entries(weights)
    const total = entries.reduce((sum, [, weight]) => sum + weight, 0)
    let remaining = float() * total
    for (const [key, weight] of entries) {
      remaining -= weight
      if (remaining < 0) return key
    }
    return entries[entries.length - 1][0]
  }

  return { float, int, shuffle, weighted }
}

/**
 * Hand out `total` members so their counts match `distribution`'s proportions,
 * then shuffle. Drawing each member independently would let a small run drift
 * far from the register figures; allocating the quota first means every scale
 * lands on the distribution and only the leftover from rounding is random.
 *
 * @param {Record<string, number>} distribution - keys to their share, in any units
 * @param {number} total - how many members to hand out
 * @param {Random} random
 * @returns {string[]}
 */
export function allocate(distribution, total, random) {
  const entries = Object.entries(distribution)
  const negative = entries.find(([, weight]) => weight < 0)
  if (negative) {
    throw new Error(
      `Cannot allocate against "${negative[0]}", which has a share of ${negative[1]}`
    )
  }

  const weightTotal = entries.reduce((sum, [, weight]) => sum + weight, 0)

  const allocated = []
  const shortfalls = []

  for (const [key, weight] of entries) {
    const exact = (weight / weightTotal) * total
    const whole = Math.floor(exact)
    allocated.push(...Array(whole).fill(key))
    shortfalls.push({ key, shortfall: exact - whole })
  }

  const leftover = total - allocated.length
  const byShortfall = shortfalls.sort((a, b) => b.shortfall - a.shortfall)
  for (let index = 0; index < leftover; index++) {
    allocated.push(byShortfall[index % byShortfall.length].key)
  }

  return random.shuffle(allocated)
}
