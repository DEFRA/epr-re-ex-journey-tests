import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import { planPopulation } from '../population/population.js'
import { DEFAULT_CALIBRATION } from '../population/calibration.js'
import { generateSpreadsheetData } from '../../spreadsheet/summarylogs-spreadsheet-data-generator.js'
import {
  heldTonnage,
  planSummaryLogRows,
  rowsForUpload,
  streamFor
} from './rows.js'
import { CONTRIBUTION } from './sheets.js'

/** @import {PlannedOperator} from '../population/population.js' */
/** @import {PlannedRegistrationRows} from './rows.js' */
/** @import {Calibration} from '../population/calibration.js' */

const SEED = 'rows'
const STREAMS = [
  'exporter',
  'reprocessorInput',
  'reprocessorOutput',
  'regOnlyExporter',
  'regOnlyReprocessor'
]

const population = planPopulation({ seed: SEED })
const plan = planSummaryLogRows({ population })

const registrations = new Map(
  population.organisations.flatMap((operator) =>
    operator.registrations.map((registration) => [
      registration.id,
      { registration, volumeFactor: operator.profile.volumeFactor }
    ])
  )
)

/** The registration the plan was made from, and the volume factor it drew. */
function plannedFor(registrationId) {
  const planned = registrations.get(registrationId)
  assert.ok(planned, `${registrationId} is not in the population`)
  return planned
}

const everyRow = (plan) => plan.registrations.flatMap((r) => r.rows)

const creditRows = (plan, stream) =>
  plan.registrations
    .filter((r) => r.stream === stream)
    .flatMap((r) => r.rows)
    .filter((r) => r.contribution === CONTRIBUTION.CREDIT)

/** The tonnage cell a worksheet reports its load through. */
const TONNAGE_CELL = {
  'Exported (sections 1, 2 and 3)': 'TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED',
  'Received (sections 1, 2 and 3)': 'TONNAGE_RECEIVED_FOR_RECYCLING',
  'Received (sections 1 and 2)': 'TONNAGE_RECEIVED_FOR_RECYCLING',
  'Reprocessed (sections 3 and 4)': 'PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION',
  'Sent on (sections 4 and 5)': 'TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON',
  'Sent on (sections 5, 6 and 7)': 'TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON',
  'Sent on (sections 5 and 6)': 'TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON'
}

/**
 * What the whole estate reports in a month through one worksheet, read off the
 * cell rather than off the balance movement. The published workbook aggregates
 * what operators report, which includes a worksheet the service never
 * classifies and a load that was stopped in transit.
 */
function monthlyTonnage(plan, stream, worksheet) {
  const cell = TONNAGE_CELL[worksheet]
  assert.ok(cell, `no tonnage cell known for ${worksheet}`)
  const total = plan.registrations
    .filter((r) => r.stream === stream)
    .flatMap((r) => r.rows)
    .filter((r) => r.worksheet === worksheet)
    .reduce((sum, row) => sum + Number(row.fields[cell]), 0)
  return total / 12
}

/**
 * The registration-months a stream reports across the plan.
 *
 * @param {ReturnType<typeof planSummaryLogRows>} plan
 * @param {string} stream
 */
const monthsOn = (plan, stream) =>
  plan.registrations
    .filter((r) => r.stream === stream)
    .reduce((sum, r) => sum + new Set(r.rows.map((row) => row.period)).size, 0)

/**
 * What one registration reports in each of its months through one worksheet,
 * read off the cell, keyed by period.
 *
 * @param {PlannedRegistrationRows} registration
 * @param {string} worksheet
 * @returns {Record<string, number>}
 */
function monthlyTotals(registration, worksheet) {
  const cell = TONNAGE_CELL[worksheet]
  assert.ok(cell, `no tonnage cell known for ${worksheet}`)
  /** @type {Record<string, number>} */
  const totals = {}
  for (const row of registration.rows) {
    if (row.worksheet !== worksheet) continue
    totals[row.period] = (totals[row.period] ?? 0) + Number(row.fields[cell])
  }
  return totals
}

/** The tonnage the service works out for a received or exported load. */
const tonnageFromWeights = (f) =>
  (f.NET_WEIGHT - f.WEIGHT_OF_NON_TARGET_MATERIALS) *
  (f.BAILING_WIRE_PROTOCOL === 'Yes' ? 0.9985 : 1) *
  f.RECYCLABLE_PROPORTION_PERCENTAGE

/**
 * A row's date cells that carry a date. A cell deliberately left empty, like a
 * repatriation date on a load that was never stopped, is pinned and so holds
 * still, but has no day to check.
 */
const pinnedDates = (row) =>
  Object.entries(row.fields).filter(
    ([marker, value]) =>
      (marker.startsWith('DATE_') || marker.startsWith('MONTH_')) &&
      value !== ''
  )

/** The service compares a calculated field against its terms to within this. */
const TOLERANCE = 1e-9

describe('planSummaryLogRows', () => {
  it('plans every registration in the population', () => {
    assert.equal(
      plan.registrations.length,
      DEFAULT_CALIBRATION.register.registrations
    )
  })

  it('plans nothing for a year before the register opened', () => {
    const empty = planSummaryLogRows({ population, year: 2000 })
    for (const registration of empty.registrations) {
      assert.deepEqual(registration.rows, [])
      assert.equal(registration.overseasSite, null)
    }
  })

  it('splits the accredited reprocessors between input and output', () => {
    const counts = {}
    for (const { stream } of plan.registrations) {
      counts[stream] = (counts[stream] ?? 0) + 1
    }
    assert.ok(
      Math.abs(counts.reprocessorInput - counts.reprocessorOutput) <= 1,
      `${counts.reprocessorInput} input against ${counts.reprocessorOutput} output`
    )
  })

  it('puts a registered-only registration on a registered-only template', () => {
    for (const { registrationId, stream } of plan.registrations) {
      const { registration } = plannedFor(registrationId)
      assert.equal(
        stream.startsWith('regOnly'),
        registration.accreditation === null,
        `${registrationId} is on ${stream}`
      )
    }
  })

  it('sizes a registration month on the rows a submission carries', () => {
    const rowsPerSubmission = DEFAULT_CALIBRATION.activity.rowsPerSubmission
    for (const stream of STREAMS) {
      const key = stream.startsWith('regOnly') ? 'registeredOnly' : stream
      const planned = plan.registrations.filter((r) => r.stream === stream)
      const months = planned.reduce(
        (sum, r) => sum + new Set(r.rows.map((row) => row.period)).size,
        0
      )
      const volume =
        planned.reduce(
          (sum, r) => sum + plannedFor(r.registrationId).volumeFactor,
          0
        ) / planned.length

      const perMonth =
        planned.reduce((sum, r) => sum + r.rows.length, 0) / months
      const expected = rowsPerSubmission[key].created * volume
      assert.ok(
        Math.abs(perMonth - expected) < expected * 0.2,
        `${stream} plans ${perMonth.toFixed(1)} rows a month against ${expected.toFixed(1)}`
      )
    }
  })

  it('reports no registration for more than the year', () => {
    for (const registration of plan.registrations) {
      const periods = new Set(registration.rows.map((row) => row.period))
      assert.ok(
        periods.size <= 12,
        `${registration.registrationId} spans ${periods.size}`
      )
      for (const period of periods) {
        assert.ok(
          period.startsWith(String(plan.year)),
          `${period} is not in ${plan.year}`
        )
      }
    }
  })

  it('lands each exporter worksheet on the tonnage the workbook reports', () => {
    for (const [worksheet, { monthlyTonnage: published }] of Object.entries(
      DEFAULT_CALIBRATION.activity.summaryLogSheets.exporter
    )) {
      if (published === undefined) continue
      const planned = monthlyTonnage(plan, 'exporter', worksheet)
      assert.ok(
        Math.abs(planned - published) < published * 0.01,
        `exporter ${worksheet} plans ${Math.round(planned)}t a month against ${published}t`
      )
    }
  })

  it('credits the reprocessor estate the national tonnage once, not once per stream', () => {
    const sheets = DEFAULT_CALIBRATION.activity.summaryLogSheets
    const received = sheets.reprocessorInput['Received (sections 1, 2 and 3)']
    const recycled = sheets.reprocessorOutput['Reprocessed (sections 3 and 4)']
    assert.ok(received.monthlyTonnage && recycled.monthlyTonnage)
    const credited =
      monthlyTonnage(
        plan,
        'reprocessorInput',
        'Received (sections 1, 2 and 3)'
      ) +
      monthlyTonnage(
        plan,
        'reprocessorOutput',
        'Reprocessed (sections 3 and 4)'
      )
    const low = Math.min(received.monthlyTonnage, recycled.monthlyTonnage)
    const high = Math.max(received.monthlyTonnage, recycled.monthlyTonnage)
    assert.ok(
      credited > low * 0.99 && credited < high * 1.01,
      `the estate credits ${Math.round(credited)}t a month against ${low}t received and ${high}t recycled`
    )
  })

  it('reports the tonnage received and sent on once across both templates', () => {
    const sheets = DEFAULT_CALIBRATION.activity.summaryLogSheets
    for (const [inputSheet, outputSheet] of [
      ['Received (sections 1, 2 and 3)', 'Received (sections 1 and 2)'],
      ['Sent on (sections 5, 6 and 7)', 'Sent on (sections 5 and 6)']
    ]) {
      const national = sheets.reprocessorInput[inputSheet].monthlyTonnage
      assert.ok(national, `${inputSheet} has no published figure`)
      assert.equal(
        sheets.reprocessorOutput[outputSheet].monthlyTonnage,
        national,
        'both templates carry the one estate figure'
      )
      const reported =
        monthlyTonnage(plan, 'reprocessorInput', inputSheet) +
        monthlyTonnage(plan, 'reprocessorOutput', outputSheet)
      assert.ok(
        Math.abs(reported - national) < national * 0.01,
        `the estate reports ${Math.round(reported)}t a month through ${inputSheet} and ${outputSheet} against ${national}t`
      )
    }
  })

  it("gives a reprocessor stream its registrations' share of the estate's figure, by registration-months", () => {
    const calibration = structuredClone(DEFAULT_CALIBRATION)
    calibration.activity.reprocessorStream = {
      reprocessorInput: 3,
      reprocessorOutput: 1
    }
    const skewed = planSummaryLogRows({
      population: planPopulation({ seed: SEED, scale: 0.1 }),
      calibration
    })
    const estate =
      monthsOn(skewed, 'reprocessorInput') +
      monthsOn(skewed, 'reprocessorOutput')
    for (const [stream, worksheet] of [
      ['reprocessorInput', 'Received (sections 1, 2 and 3)'],
      ['reprocessorInput', 'Sent on (sections 5, 6 and 7)'],
      ['reprocessorOutput', 'Received (sections 1 and 2)'],
      ['reprocessorOutput', 'Reprocessed (sections 3 and 4)'],
      ['reprocessorOutput', 'Sent on (sections 5 and 6)']
    ]) {
      const published =
        calibration.activity.summaryLogSheets[stream][worksheet].monthlyTonnage
      assert.ok(published, `${stream} ${worksheet} has no published figure`)
      const expected = (published * 0.1 * monthsOn(skewed, stream)) / estate
      const planned = monthlyTonnage(skewed, stream, worksheet)
      assert.ok(
        Math.abs(planned - expected) < expected * 0.01,
        `${stream} ${worksheet} plans ${Math.round(planned)}t a month against ${Math.round(expected)}t`
      )
    }
  })

  it('scales the tonnage with the population rather than the row count', () => {
    const tenth = planSummaryLogRows({
      population: planPopulation({ seed: SEED, scale: 0.1 })
    })
    const whole = monthlyTonnage(
      plan,
      'exporter',
      'Exported (sections 1, 2 and 3)'
    )
    const part = monthlyTonnage(
      tenth,
      'exporter',
      'Exported (sections 1, 2 and 3)'
    )
    assert.ok(
      Math.abs(part - whole * 0.1) < whole * 0.01,
      `a tenth-scale run credits ${Math.round(part)}t against ${Math.round(whole * 0.1)}t`
    )
  })

  it("varies a registration's tonnage from month to month", () => {
    const tenth = planSummaryLogRows({
      population: planPopulation({ seed: SEED, scale: 0.1 })
    })
    const wholeYear = tenth.registrations.filter(
      (r) =>
        r.stream === 'reprocessorInput' &&
        new Set(r.rows.map((row) => row.period)).size === 12
    )
    assert.ok(wholeYear.length > 0, 'no reprocessor reports the whole year')
    for (const registration of wholeYear) {
      const months = Object.values(
        monthlyTotals(registration, 'Received (sections 1, 2 and 3)')
      )
      const spread = Math.max(...months) / Math.min(...months)
      assert.ok(
        spread > 1.1,
        `${registration.registrationId} reports ${months.map(Math.round).join(', ')}`
      )
    }
  })

  it("keeps the estate's year on the national figure while the months vary", () => {
    const tenth = planSummaryLogRows({
      population: planPopulation({ seed: SEED, scale: 0.1 })
    })
    const worksheet = 'Received (sections 1, 2 and 3)'
    const published =
      DEFAULT_CALIBRATION.activity.summaryLogSheets.reprocessorInput[worksheet]
        .monthlyTonnage
    assert.ok(published)
    const share =
      monthsOn(tenth, 'reprocessorInput') /
      (monthsOn(tenth, 'reprocessorInput') +
        monthsOn(tenth, 'reprocessorOutput'))
    const expected = published * 0.1 * share
    const planned = monthlyTonnage(tenth, 'reprocessorInput', worksheet)
    // Variation that only redistributes a registration's year cannot move the
    // estate; noise drawn month by month would, by more than the weights round.
    assert.ok(
      Math.abs(planned - expected) < expected * 0.001,
      `the estate reports ${planned.toFixed(1)}t a month against ${expected.toFixed(1)}t`
    )
  })

  it('replays the same rows from the same seed', () => {
    assert.deepEqual(
      planSummaryLogRows({ population: planPopulation({ seed: SEED }) }),
      plan
    )
  })

  it('draws different rows from a different seed', () => {
    const other = planSummaryLogRows({
      population: planPopulation({ seed: 'other' })
    })
    assert.notDeepEqual(everyRow(other)[0].fields, everyRow(plan)[0].fields)
  })

  it('gives every row an identity that only climbs within its worksheet', () => {
    for (const registration of plan.registrations) {
      const seen = new Map()
      for (const row of registration.rows) {
        const previous = seen.get(row.worksheet)
        if (previous !== undefined) {
          assert.equal(
            row.rowId,
            previous + 1,
            `${registration.registrationId} ${row.worksheet} jumped to ${row.rowId}`
          )
        }
        seen.set(row.worksheet, row.rowId)
      }
    }
  })
})

describe('a planned row that has to count', () => {
  it('pins every date, so the simulated clock cannot move it', () => {
    for (const row of everyRow(plan)) {
      const dates = pinnedDates(row)
      assert.ok(
        dates.length > 0,
        `${row.worksheet} row ${row.rowId} pins no date`
      )
      for (const [marker, value] of dates) {
        assert.match(
          String(value),
          /^\d{2}\/\d{2}\/\d{4}$/,
          `${marker} is ${value}`
        )
      }
    }
  })

  it('keeps every pinned date inside the accreditation window', () => {
    for (const registration of plan.registrations) {
      const { accreditation } = plannedFor(
        registration.registrationId
      ).registration
      if (!accreditation) continue
      for (const row of registration.rows) {
        for (const [marker, value] of pinnedDates(row)) {
          const day = String(value).split('/').reverse().join('-')
          assert.ok(
            day >= accreditation.validFrom && day <= accreditation.validTo,
            `${registration.registrationId} ${marker} ${day} falls outside ${accreditation.validFrom}..${accreditation.validTo}`
          )
        }
      }
    }
  })

  it('never pins a date before the month the row is reported for', () => {
    for (const registration of plan.registrations) {
      for (const row of registration.rows) {
        for (const [marker, value] of pinnedDates(row)) {
          const day = String(value).split('/').reverse().join('-')
          assert.ok(
            day.slice(0, 7) >= row.date.slice(0, 7),
            `${registration.registrationId} ${marker} ${day} predates ${row.date}`
          )
        }
      }
    }
  })

  it('dates exports across the whole month, not only where a receipt fits', () => {
    const days = new Set(
      creditRows(plan, 'exporter').map((row) => Number(row.date.slice(8)))
    )
    assert.ok(days.has(1) && days.has(28), [...days].sort().join(','))
  })

  it('never says a note was already issued against the waste', () => {
    for (const row of creditRows(plan, 'exporter').concat(
      creditRows(plan, 'reprocessorInput')
    )) {
      assert.equal(row.fields.WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE, 'No')
    }
  })

  it('adds the product weight on every reprocessed output row', () => {
    for (const row of creditRows(plan, 'reprocessorOutput')) {
      assert.equal(row.fields.ADD_PRODUCT_WEIGHT, 'Yes')
    }
  })

  it('stops or refuses exported loads at the rate the workbook reports', () => {
    const exported = plan.registrations
      .filter((r) => r.stream === 'exporter')
      .flatMap((r) => r.rows)
      .filter((r) => r.worksheet === 'Exported (sections 1, 2 and 3)')
    const stopped = exported.filter(
      (r) => r.fields.WAS_THE_WASTE_STOPPED === 'Yes'
    )
    const refused = exported.filter(
      (r) => r.fields.WAS_THE_WASTE_REFUSED === 'Yes'
    )
    const { stoppedShare, refusedShare } =
      DEFAULT_CALIBRATION.activity.exportLoadOutcome

    assert.ok(
      stopped.length / exported.length < stoppedShare * 3,
      `${stopped.length} of ${exported.length} exported loads were stopped`
    )
    assert.ok(
      refused.length / exported.length < refusedShare * 3 + 1 / exported.length,
      `${refused.length} of ${exported.length} exported loads were refused`
    )
    for (const row of stopped.concat(refused)) {
      assert.equal(row.tonnage, 0, 'an excluded load still carries tonnage')
    }
  })

  it('moves nothing where the service never classifies the worksheet', () => {
    for (const row of everyRow(plan)) {
      if (row.contribution !== CONTRIBUTION.NONE) continue
      assert.equal(
        row.tonnage,
        0,
        `${row.worksheet} row ${row.rowId} moves ${row.tonnage} and contributes nothing`
      )
    }
  })

  it('never exports through an interim site it has not planned', () => {
    for (const row of creditRows(plan, 'exporter')) {
      assert.equal(row.fields.DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE, 'No')
    }
  })

  it('names an overseas site whose approval covers the earliest export', () => {
    for (const registration of plan.registrations) {
      if (registration.stream !== 'exporter') continue
      const earliest = registration.rows.map((row) => row.date).sort()[0]
      assert.ok(registration.overseasSite)
      assert.ok(registration.overseasSite.validFrom <= earliest)
    }
  })
})

describe('what the service holds of a row', () => {
  it('rounds a cell to two decimals, half up, as the service does', () => {
    assert.equal(heldTonnage(1.005), 1.01)
    assert.equal(heldTonnage(2.675), 2.68)
    assert.equal(heldTonnage(1621.5149999999999), 1621.51)
    assert.equal(heldTonnage(12), 12)
    assert.equal(heldTonnage(12.3), 12.3)
    assert.equal(heldTonnage(0.1 + 0.2), 0.3)
    // The residue of subtracting equal weights, which a cell of no tonnage
    // leaves, on either side of zero.
    assert.equal(heldTonnage(1.785238623597252e-15), 0)
    assert.equal(heldTonnage(-1.785238623597252e-15), 0)
  })

  it('reports each tonnage as the service will hold it, not as the cell reads', () => {
    for (const row of everyRow(plan)) {
      if (row.contribution === CONTRIBUTION.NONE) continue
      const cell = Number(row.fields[TONNAGE_CELL[row.worksheet]])
      assert.equal(
        row.tonnage,
        heldTonnage(cell),
        `${row.worksheet} row ${row.rowId} moves ${row.tonnage} for a cell of ${cell}`
      )
    }
  })

  it('contributes nothing where the service would hold nothing', () => {
    const calibration = structuredClone(DEFAULT_CALIBRATION)
    for (const sheets of Object.values(calibration.activity.summaryLogSheets)) {
      for (const sheet of Object.values(sheets)) {
        if (sheet.monthlyTonnage !== undefined) sheet.monthlyTonnage = 0
      }
    }
    const empty = planSummaryLogRows({
      population: planPopulation({ seed: SEED, scale: 0.01 }),
      calibration
    })
    for (const row of everyRow(empty)) {
      assert.equal(row.tonnage, 0)
      assert.equal(row.contribution, CONTRIBUTION.NONE)
    }
  })

  it('holds no more than the two decimals the service keeps', () => {
    for (const row of everyRow(plan)) {
      assert.match(
        String(row.tonnage),
        /^\d+(\.\d{1,2})?$/,
        `${row.worksheet} row ${row.rowId} moves ${row.tonnage}`
      )
    }
  })
})

describe('the arithmetic the service recomputes', () => {
  it('derives the net weight from the weights around it', () => {
    for (const row of creditRows(plan, 'exporter').concat(
      creditRows(plan, 'reprocessorInput')
    )) {
      const f = row.fields
      assert.ok(
        Math.abs(
          f.NET_WEIGHT - (f.GROSS_WEIGHT - f.TARE_WEIGHT - f.PALLET_WEIGHT)
        ) < TOLERANCE,
        `net weight ${f.NET_WEIGHT} does not follow from ${f.GROSS_WEIGHT}`
      )
    }
  })

  it('derives the tonnage received from the net weight, not around it', () => {
    for (const row of creditRows(plan, 'reprocessorInput')) {
      const f = row.fields
      assert.ok(
        Math.abs(f.TONNAGE_RECEIVED_FOR_RECYCLING - tonnageFromWeights(f)) <
          TOLERANCE,
        `tonnage ${f.TONNAGE_RECEIVED_FOR_RECYCLING} does not follow from the weights`
      )
      assert.equal(row.tonnage, heldTonnage(f.TONNAGE_RECEIVED_FOR_RECYCLING))
    }
  })

  it('derives the tonnage exported from the net weight, not around it', () => {
    for (const row of creditRows(plan, 'exporter')) {
      const f = row.fields
      assert.ok(
        Math.abs(f.TONNAGE_RECEIVED_FOR_EXPORT - tonnageFromWeights(f)) <
          TOLERANCE,
        `tonnage ${f.TONNAGE_RECEIVED_FOR_EXPORT} does not follow from the weights`
      )
      assert.equal(
        row.tonnage,
        heldTonnage(f.TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED)
      )
    }
  })

  it('derives the UK packaging proportion from the product and its percentage', () => {
    for (const row of creditRows(plan, 'reprocessorOutput')) {
      const f = row.fields
      assert.ok(
        Math.abs(
          f.PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION -
            f.PRODUCT_TONNAGE * f.UK_PACKAGING_WEIGHT_PERCENTAGE
        ) < TOLERANCE,
        `proportion ${f.PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION} does not follow from the product`
      )
      assert.equal(
        row.tonnage,
        heldTonnage(f.PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION)
      )
    }
  })
})

/** Every date marker a rendered worksheet carries, read off its marker row. */
function dateMarkersOf(workbook, worksheetName) {
  const sheet = workbook.getWorksheet(worksheetName)
  assert.ok(sheet, `no worksheet named ${worksheetName}`)
  const markers = []
  sheet.getRow(1).eachCell((cell) => {
    const marker = String(cell.value)
    if (marker.startsWith('DATE_') || marker.startsWith('MONTH_')) {
      markers.push(marker)
    }
  })
  return markers
}

/**
 * Every accredited registration of a type, each held by its operator alone.
 *
 * @param {'exporter' | 'reprocessor'} processingType
 * @returns {PlannedOperator[]}
 */
const holdingOneAccredited = (processingType) =>
  population.organisations.flatMap((operator) =>
    operator.registrations
      .filter((r) => r.processingType === processingType && r.accreditation)
      .map((registration) => ({ ...operator, registrations: [registration] }))
  )

/**
 * An operator like this one, registered for the same work without an
 * accreditation.
 *
 * @param {PlannedOperator} operator
 * @returns {PlannedOperator}
 */
const registeredOnly = (operator) => ({
  ...operator,
  id: `${operator.id}-registered`,
  registrations: operator.registrations.map((registration) => ({
    ...registration,
    id: `${registration.id}-registered`,
    organisationId: `${operator.id}-registered`,
    accreditation: null
  }))
})

describe('a planned row rendered into a workbook', () => {
  // One registration on every template whatever the seed: an even quota hands
  // two accredited reprocessors one to each side, and taking an accreditation
  // away puts a registration on its registered-only template.
  const [exporter] = holdingOneAccredited('exporter')
  const [reprocessor, secondReprocessor] = holdingOneAccredited('reprocessor')
  assert.ok(
    exporter && reprocessor && secondReprocessor,
    'the population holds too few accredited registrations to build from'
  )
  const everyStream = planSummaryLogRows({
    population: {
      ...population,
      organisations: [
        exporter,
        reprocessor,
        secondReprocessor,
        registeredOnly(exporter),
        registeredOnly(reprocessor)
      ]
    },
    calibration: {
      ...DEFAULT_CALIBRATION,
      activity: {
        ...DEFAULT_CALIBRATION.activity,
        reprocessorStream: { reprocessorInput: 1, reprocessorOutput: 1 }
      }
    }
  })

  for (const stream of STREAMS) {
    it(`names only fields a ${stream} template carries`, async () => {
      const registration = everyStream.registrations.find(
        (r) => r.stream === stream
      )
      assert.ok(registration, `no ${stream} registration was planned`)

      // Two rows of each worksheet is enough to say every marker is real, and
      // a month of a large operator's output takes the better part of a minute.
      const taken = new Map()
      const rows = registration.rows.filter((row) => {
        const already = taken.get(row.worksheet) ?? 0
        taken.set(row.worksheet, already + 1)
        return already < 2
      })

      const file = await generateSpreadsheetData({
        wasteProcessingType: stream,
        materialSuffix: 'PA',
        rows: rowsForUpload(rows),
        silentLogging: true
      })

      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.readFile(file)
      const sheet = workbook.getWorksheet(rows[0].worksheet)
      assert.ok(sheet, `no worksheet named ${rows[0].worksheet}`)
      assert.equal(String(sheet.getCell('B4').value), String(rows[0].rowId))

      // The plan can only hold a date still by naming it, so a template date
      // the plan does not name is one the generator will redraw against the
      // clock on the next upload. Reading the markers off the template is what
      // catches that; reading them off the plan cannot.
      for (const row of rows) {
        const planned = Object.keys(row.fields)
        for (const marker of dateMarkersOf(workbook, row.worksheet)) {
          assert.ok(
            planned.includes(marker),
            `${stream} ${row.worksheet} leaves ${marker} unpinned`
          )
        }
      }
    })
  }

  it('refuses a field no template carries', async () => {
    await assert.rejects(
      generateSpreadsheetData({
        wasteProcessingType: 'exporter',
        rows: {
          'Exported (sections 1, 2 and 3)': [
            { rowId: 1000, fields: { NOT_A_FIELD: 1 } }
          ]
        },
        silentLogging: true
      }),
      /no field marked NOT_A_FIELD/
    )
  })
})

describe('a calibration that names different worksheets', () => {
  /** The defaults with one exporter worksheet renamed, as a misspelling would. */
  function misspelt() {
    const sheets = DEFAULT_CALIBRATION.activity.summaryLogSheets
    const { 'Sent on (sections 4 and 5)': sentOn, ...rest } = sheets.exporter
    return {
      ...DEFAULT_CALIBRATION,
      activity: {
        ...DEFAULT_CALIBRATION.activity,
        summaryLogSheets: {
          ...sheets,
          exporter: { ...rest, 'Sent on (sections 4 and 6)': sentOn }
        }
      }
    }
  }

  it('is refused rather than quietly planning no rows', () => {
    assert.throws(
      () =>
        planSummaryLogRows({
          population: planPopulation({ seed: SEED, scale: 0.1 }),
          calibration: misspelt()
        }),
      /disagree on exporter worksheets: Sent on \(sections 4 and 5\), Sent on \(sections 4 and 6\)/
    )
  })
})

describe('a calibration that gives a tonnage to a worksheet without a load', () => {
  /**
   * The defaults with a figure on the input worksheet the workbook leaves blank.
   *
   * @returns {Calibration}
   */
  function withReprocessedTonnage() {
    const sheets = DEFAULT_CALIBRATION.activity.summaryLogSheets
    return {
      ...DEFAULT_CALIBRATION,
      activity: {
        ...DEFAULT_CALIBRATION.activity,
        summaryLogSheets: {
          ...sheets,
          reprocessorInput: {
            ...sheets.reprocessorInput,
            'Reprocessed (section 4)': {
              ...sheets.reprocessorInput['Reprocessed (section 4)'],
              monthlyTonnage: 1000
            }
          }
        }
      }
    }
  }

  it('is refused rather than quietly planning rows that carry none of it', () => {
    assert.throws(
      () =>
        planSummaryLogRows({
          population: planPopulation({ seed: SEED, scale: 0.1 }),
          calibration: withReprocessedTonnage()
        }),
      /gives reprocessorInput worksheet "Reprocessed \(section 4\)" a monthlyTonnage, but no row on it carries a load/
    )
  })
})

describe('streamFor', () => {
  it('reads an unaccredited registration onto the registered-only template', () => {
    assert.equal(
      streamFor({ processingType: 'exporter', accreditation: null }),
      'regOnlyExporter'
    )
    assert.equal(
      streamFor({ processingType: 'reprocessor', accreditation: null }),
      'regOnlyReprocessor'
    )
  })

  it('takes the reprocessing side it is allocated', () => {
    const accredited = {
      processingType: /** @type {const} */ ('reprocessor'),
      accreditation: {
        status: /** @type {const} */ ('approved'),
        tonnageBand: 'Up to 5,000 tonnes',
        validFrom: '2026-01-01',
        validTo: '2026-12-31'
      }
    }
    assert.equal(
      streamFor(accredited, 'reprocessorOutput'),
      'reprocessorOutput'
    )
    assert.equal(streamFor(accredited), 'reprocessorInput')
  })
})

describe('rowsForUpload', () => {
  it('keys the rows by worksheet and drops what the generator does not read', () => {
    const rows = [
      {
        rowId: 1000,
        worksheet: 'Exported (sections 1, 2 and 3)',
        period: '2026-01',
        date: '2026-01-04',
        contribution: CONTRIBUTION.CREDIT,
        tonnage: 12,
        fields: { DATE_OF_EXPORT: '04/01/2026' },
        seed: 7
      }
    ]
    assert.deepEqual(rowsForUpload(rows), {
      'Exported (sections 1, 2 and 3)': [
        { rowId: 1000, fields: { DATE_OF_EXPORT: '04/01/2026' }, seed: 7 }
      ]
    })
  })
})
