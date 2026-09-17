/**
 * Plans the operators a simulator run will create.
 *
 * Pure and seeded: nothing here touches an API, a clock or the filesystem, and
 * the same settings always give the same population. The result is the input
 * every later planner reads — the summary log row plan, the event calendar and
 * the executors that replay them.
 *
 * Shapes and settings are documented in `README.md` beside this file.
 */

import { MATERIALS } from '../../materials.js'
import { DEFAULT_CALIBRATION } from './calibration.js'
import { PROFILE_MIXES, buildArchetypes, buildProfile } from './profiles.js'
import { allocate, createRandom } from './random.js'

/**
 * @typedef {Object} PlannedAccreditation
 * @property {'approved' | 'suspended' | 'cancelled'} status
 * @property {string} tonnageBand - as `test/support/generator.js` spells it
 * @property {string} validFrom - ISO date, the day the registration opened
 * @property {string} validTo - ISO date, the last day of that accreditation year
 */

/**
 * @typedef {Object} PlannedRegistration
 * @property {string} id
 * @property {string} organisationId
 * @property {string} agency - EA, NIEA, NRW or SEPA
 * @property {string} nation
 * @property {'exporter' | 'reprocessor'} processingType
 * @property {typeof MATERIALS[number]} material
 * @property {string | null} siteId - the site this reprocesses at; null for an exporting registration
 * @property {'approved' | 'cancelled'} status
 * @property {string} activeFrom - ISO date
 * @property {PlannedAccreditation | null} accreditation - null where the operator is registered but not accredited
 */

/**
 * @typedef {Object} PlannedOperator
 * @property {string} id
 * @property {'exporter' | 'reprocessor' | 'both'} type
 * @property {string} agency
 * @property {string} nation
 * @property {string[]} materials - suffixes, sorted
 * @property {{id: string}[]} sites - empty for an exporting-only operator
 * @property {PlannedRegistration[]} registrations
 * @property {import('./profiles.js').BehaviourProfile} profile
 */

/**
 * @typedef {Object} PlannedPopulation
 * @property {string | number} seed
 * @property {number} scale
 * @property {string} profileMix
 * @property {PlannedOperator[]} organisations
 */

const MATERIALS_BY_SUFFIX = Object.fromEntries(
  MATERIALS.map((material) => [material.suffix, material])
)

const REGISTERED_ONLY = 'none'

const identifier = (prefix, index) =>
  `${prefix}-${String(index).padStart(4, '0')}`

const dayCount = (from, to) =>
  Math.round((Date.parse(to) - Date.parse(from)) / 86400000)

const addDays = (from, days) =>
  new Date(Date.parse(from) + days * 86400000).toISOString().slice(0, 10)

const endOfYear = (date) => `${date.slice(0, 4)}-12-31`

const addMonth = (date) => {
  const [year, month] = date.split('-').map(Number)
  return `${month === 12 ? year + 1 : year}-${String(month === 12 ? 1 : month + 1).padStart(2, '0')}-01`
}

/**
 * Fit one spread inside another, largest to largest, so nothing is asked to
 * hold more than it has room for.
 *
 * The register says 236 organisations hold a single registration but 261 hold
 * a single material, so drawing the two independently keeps asking a
 * one-registration organisation to carry three materials. Sites are the same
 * shape of problem: 176 of them across 184 reprocessing registrations, so an
 * independent draw strands sites nothing is registered on. Ordering both
 * spreads first distorts neither.
 *
 * @param {number[]} capacities - how much each holder has room for
 * @param {number[]} counts - the spread to fit inside them
 * @returns {number[]} a count per index of `capacities`, never above it
 */
function fitBySize(capacities, counts) {
  const byDescendingCapacity = capacities
    .map((capacity, index) => ({ capacity, index }))
    .sort((a, b) => b.capacity - a.capacity)
  const descendingCounts = [...counts].sort((a, b) => b - a)

  const fitted = Array(capacities.length).fill(0)
  byDescendingCapacity.forEach(({ capacity, index }, rank) => {
    fitted[index] = Math.min(descendingCounts[rank], capacity)
  })
  return fitted
}

/**
 * Only an organisation with room for two registrations can hold both an
 * exporting and a reprocessing one, so the "both" organisations go on the
 * larger ones.
 */
function assignTypes(register, registrationCounts, random) {
  const requested = allocate(
    register.organisationType,
    registrationCounts.length,
    random
  )
  const bothWanted = requested.filter((type) => type === 'both').length

  const roomForBoth = random.shuffle(
    registrationCounts
      .map((count, index) => ({ count, index }))
      .filter(({ count }) => count >= 2)
      .map(({ index }) => index)
  )
  const both = new Set(roomForBoth.slice(0, bothWanted))

  const singleTypes = allocate(
    {
      exporter: register.organisationType.exporter,
      reprocessor: register.organisationType.reprocessor
    },
    registrationCounts.length - both.size,
    random
  )

  let next = 0
  return registrationCounts.map((_, index) =>
    both.has(index) ? 'both' : singleTypes[next++]
  )
}

/**
 * An exporting organisation exports everything it holds and a reprocessing one
 * reprocesses everything; an organisation doing both does at least one of each
 * and splits the rest evenly, which is what puts the estate on the register's
 * 205 exporting rows against 184 reprocessing ones.
 */
function assignProcessingTypes(type, registrationCount, random) {
  if (type !== 'both') {
    return Array(registrationCount).fill(type)
  }

  const remainder = allocate(
    { exporter: 1, reprocessor: 1 },
    registrationCount - 2,
    random
  )
  return random.shuffle(['exporter', 'reprocessor', ...remainder])
}

const timesEach = (suffixes) => {
  /** @type {Record<string, number>} */
  const counts = {}
  for (const suffix of suffixes) counts[suffix] = (counts[suffix] ?? 0) + 1
  return counts
}

/**
 * Draw every registration a material weighted by what its processing type
 * registers, then hold the organisation to the number of distinct materials
 * the register gave it by keeping the ones it drew most and moving the rest
 * onto those. That is what makes a three-registration, one-material
 * organisation come out of the plan.
 *
 * Drawing first and narrowing afterwards is what keeps the material counts on
 * the register. Picking a set of distinct materials up front excludes each one
 * as it is taken, which inflates the small materials at plastic's expense.
 */
function assignMaterials(register, processingTypes, materialCount, random) {
  const drawn = processingTypes.map((processingType) =>
    random.weighted(register.rowsByTypeAndMaterial[processingType])
  )

  const timesDrawn = timesEach(drawn)
  const held = new Set(
    Object.keys(timesDrawn)
      .sort((a, b) => timesDrawn[b] - timesDrawn[a])
      .slice(0, materialCount)
  )

  const suffixes = processingTypes.map((processingType, row) => {
    if (held.has(drawn[row])) return drawn[row]

    const weights = register.rowsByTypeAndMaterial[processingType]
    const registrable = Object.fromEntries(
      [...held]
        .filter((suffix) => weights[suffix] > 0)
        .map((suffix) => [suffix, weights[suffix]])
    )
    // Nothing the organisation holds is registrable for this processing type,
    // so it takes on one more material rather than registering a pairing the
    // register never shows, such as exporting fibre-based composite.
    if (Object.keys(registrable).length === 0) {
      const added = random.weighted(weights)
      held.add(added)
      return added
    }
    return random.weighted(registrable)
  })

  // The draw can repeat itself and leave the organisation holding fewer
  // materials than the register gave it, so a duplicated row moves onto a
  // material it has not got.
  //
  // That is what holds the estate on the register's materials per
  // organisation, and the material row totals are what pays for it. The row
  // moved is most often the commonest material and it never moves onto one, so
  // plastic comes out a few per cent light and every other material heavy.
  while (held.size < materialCount) {
    const counts = timesEach(suffixes)
    const duplicated = suffixes
      .map((suffix, row) => ({ suffix, row }))
      .filter(({ suffix }) => counts[suffix] > 1)
    if (duplicated.length === 0) break

    const { row } = duplicated[random.int(0, duplicated.length - 1)]
    const weights = register.rowsByTypeAndMaterial[processingTypes[row]]
    const unheld = Object.fromEntries(
      Object.entries(weights).filter(([suffix]) => !held.has(suffix))
    )
    if (Object.keys(unheld).length === 0) break

    const suffix = random.weighted(unheld)
    held.add(suffix)
    suffixes[row] = suffix
  }

  return suffixes.map((suffix) => MATERIALS_BY_SUFFIX[suffix])
}

/**
 * Put back any status the quota rounded away. Suspension and cancellation are
 * two rows each in 389, so below about half scale they floor to nothing and a
 * scaled-down run stops exercising them at all. Wherever there are rows to
 * spare, each status the register carries gets at least one, taken off the
 * commonest.
 */
function withEveryStatus(statuses, distribution, random) {
  const present = new Set(statuses)
  const missing = Object.keys(distribution).filter(
    (key) => distribution[key] > 0 && !present.has(key)
  )
  if (missing.length === 0) return statuses

  const commonest = Object.keys(distribution).sort(
    (a, b) => distribution[b] - distribution[a]
  )[0]
  const spare = random.shuffle(
    statuses
      .map((status, index) => ({ status, index }))
      .filter(({ status }) => status === commonest)
      .map(({ index }) => index)
  )

  // Keep one row on the commonest status. A run whose every registration was
  // taken for a rarity has nothing approved to report against, which at the
  // smallest scales is every run.
  const filled = [...statuses]
  missing.slice(0, spare.length - 1).forEach((key, rank) => {
    filled[spare[rank]] = key
  })
  return filled
}

/**
 * Most registrations opened on the first day of the scheme and the rest are
 * handed out by the month the register dates them to, then given a day within
 * it. Drawing the rest evenly across the whole window instead would put a
 * registration the register places in August into March, owing five monthly
 * returns it never owed.
 */
function assignActiveFrom(register, registrationCount, random) {
  const { goLive, goLiveCount, scatteredByMonth } = register.activeFrom

  return allocate(
    { goLive: goLiveCount, ...scatteredByMonth },
    registrationCount,
    random
  ).map((when) => {
    if (when === 'goLive') return goLive
    const firstOfMonth = `${when}-01`
    const days = dayCount(firstOfMonth, addMonth(firstOfMonth))
    // The go-live day is a bucket of its own, so a scattered registration in
    // that month opened on some later day.
    const first = when === goLive.slice(0, 7) ? 1 : 0
    return addDays(firstOfMonth, random.int(first, days - 1))
  })
}

/**
 * How much an operator reports and issues, from the tonnage bands it holds,
 * normalised so the estate averages one. Normalising against the population
 * rather than a fixed divisor keeps the estate total on the calibrated monthly
 * rate whatever band mix a given scale happens to draw.
 */
function volumeFactors(bandWeights, organisations) {
  const smallest = Math.min(...Object.values(bandWeights))

  const raw = organisations.map((organisation) => {
    const weights = organisation.registrations.map(
      (registration) =>
        bandWeights[registration.accreditation?.tonnageBand] ?? smallest
    )
    return weights.reduce((sum, weight) => sum + weight, 0) / weights.length
  })

  const mean = raw.reduce((sum, weight) => sum + weight, 0) / raw.length
  return raw.map((weight) => weight / mean)
}

/**
 * @param {{seed?: string | number, scale?: number, profileMix?: string, calibration?: import('./calibration.js').Calibration}} [settings]
 *   `scale` of 1 plans the register the calibration describes, which for the
 *   default is 293 organisations holding 389 registrations. `profileMix` names
 *   one of `PROFILE_MIXES`. `calibration` is every figure the plan is built
 *   from; pass `loadCalibration()` to pick up an overlay.
 * @returns {PlannedPopulation}
 */
export function planPopulation({
  seed = 'pepr',
  scale = 1,
  profileMix = 'production',
  calibration = DEFAULT_CALIBRATION
} = {}) {
  if (!PROFILE_MIXES[profileMix]) {
    throw new Error(
      `Unknown profile mix "${profileMix}" — expected one of ${Object.keys(PROFILE_MIXES).join(', ')}`
    )
  }
  if (!(scale > 0)) {
    throw new Error(`Scale must be above zero — got ${scale}`)
  }

  const { register, agencyNations } = calibration
  const unnamedAgency = Object.keys(register.agencyRows).find(
    (agency) => !(agency in agencyNations)
  )
  if (unnamedAgency) {
    throw new Error(
      `The calibration registers rows against "${unnamedAgency}" but gives it no nation`
    )
  }

  const random = createRandom(seed)
  const organisationCount = Math.max(
    1,
    Math.round(register.organisations * scale)
  )

  const registrationCounts = allocate(
    register.registrationsPerOrganisation,
    organisationCount,
    random
  ).map(Number)
  const materialCounts = allocate(
    register.materialsPerOrganisation,
    organisationCount,
    random
  ).map(Number)

  const fittedMaterialCounts = fitBySize(registrationCounts, materialCounts)
  const types = assignTypes(register, registrationCounts, random)
  // An operator is regulated by one agency and its registrations inherit it,
  // so the register's rows per agency is a quota over organisations rather
  // than over rows. Across seeds each agency lands on its register count, and
  // lands tighter than drawing every row on its own would, because the quota
  // is exact and most organisations hold a single registration. One run still
  // reads light or heavy on a small agency: over 200 seeds of the committed
  // calibration, Northern Ireland's 45 rows came out anywhere from 35 to 62.
  const agencies = allocate(register.agencyRows, organisationCount, random)

  const planned = registrationCounts.map((registrationCount, index) => {
    const processingTypes = assignProcessingTypes(
      types[index],
      registrationCount,
      random
    )
    return {
      processingTypes,
      materials: assignMaterials(
        register,
        processingTypes,
        fittedMaterialCounts[index],
        random
      )
    }
  })

  const reprocessorOrganisations = planned
    .map((organisation, index) => ({ organisation, index }))
    .filter(({ index }) => types[index] !== 'exporter')
  const siteCounts = fitBySize(
    reprocessorOrganisations.map(
      ({ organisation }) =>
        organisation.processingTypes.filter((type) => type === 'reprocessor')
          .length
    ),
    allocate(
      register.sitesPerReprocessorOrganisation,
      reprocessorOrganisations.length,
      random
    ).map(Number)
  )
  const sitesByOrganisation = Array(organisationCount).fill(0)
  reprocessorOrganisations.forEach(({ index }, rank) => {
    sitesByOrganisation[index] = siteCounts[rank]
  })

  const registrationTotal = planned.reduce(
    (sum, organisation) => sum + organisation.processingTypes.length,
    0
  )
  const accreditationStatuses = withEveryStatus(
    allocate(register.accreditationStatus, registrationTotal, random),
    register.accreditationStatus,
    random
  )
  const activeFroms = assignActiveFrom(register, registrationTotal, random)
  const tonnageBands = allocate(
    register.tonnageBand,
    accreditationStatuses.filter((status) => status !== REGISTERED_ONLY).length,
    random
  )

  let nextRegistration = 0
  let nextBand = 0

  const registered = planned.map(({ processingTypes, materials }, index) => {
    const agency = agencies[index]
    const organisationId = identifier('OP', index + 1)
    const sites = Array.from(
      { length: sitesByOrganisation[index] },
      (_, site) => ({ id: `${organisationId}-S${site + 1}` })
    )

    let nextSite = 0
    const registrations = processingTypes.map((processingType, row) => {
      const at = nextRegistration++
      const activeFrom = activeFroms[at]
      const accreditationStatus = accreditationStatuses[at]

      return {
        id: `${organisationId}-R${row + 1}`,
        organisationId,
        agency,
        nation: agencyNations[agency],
        processingType,
        // A copy, so a caller that edits a registration's material cannot
        // reach back into the shared vocabulary and change every later plan.
        material: { ...materials[row] },
        siteId:
          processingType === 'reprocessor'
            ? sites[nextSite++ % sites.length].id
            : null,
        // The register carries two cancelled registrations and two cancelled
        // accreditations, which are the same two rows: a cancelled
        // registration has nothing left to be accredited for.
        status: accreditationStatus === 'cancelled' ? 'cancelled' : 'approved',
        activeFrom,
        accreditation:
          accreditationStatus === REGISTERED_ONLY
            ? null
            : {
                status: accreditationStatus,
                tonnageBand: tonnageBands[nextBand++],
                validFrom: activeFrom,
                validTo: endOfYear(activeFrom)
              }
      }
    })

    return {
      id: organisationId,
      type: types[index],
      agency,
      nation: agencyNations[agency],
      materials: [
        ...new Set(materials.map((material) => material.suffix))
      ].sort(),
      sites,
      registrations
    }
  })

  const archetypes = allocate(
    PROFILE_MIXES[profileMix],
    organisationCount,
    random
  )
  const factors = volumeFactors(calibration.tonnageBandPrnWeight, registered)
  const dispositions = buildArchetypes(calibration)
  const organisations = registered.map((organisation, index) => ({
    ...organisation,
    profile: buildProfile({
      archetypes: dispositions,
      archetype: archetypes[index],
      volumeFactor: factors[index],
      random
    })
  }))

  return { seed, scale, profileMix, organisations }
}
