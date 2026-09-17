import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import { planPopulation } from '../population/population.js'
import { DEFAULT_CALIBRATION } from '../population/calibration.js'
import { generateSpreadsheetData } from '../../spreadsheet/summarylogs-spreadsheet-data-generator.js'
import { planSummaryLogRows, rowsForUpload, streamFor } from './rows.js'
import { CONTRIBUTION } from './sheets.js'

const SEED = 'rows-test'
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

/** What the whole estate moves in a month through one worksheet. */
function monthlyTonnage(plan, stream, worksheet) {
  const total = plan.registrations
    .filter((r) => r.stream === stream)
    .flatMap((r) => r.rows)
    .filter((r) => r.worksheet === worksheet)
    .reduce((sum, row) => sum + row.tonnage, 0)
  return total / 12
}

/** The tonnage the service works out for a received or exported load. */
const tonnageFromWeights = (f) =>
  (f.NET_WEIGHT - f.WEIGHT_OF_NON_TARGET_MATERIALS) *
  (f.BAILING_WIRE_PROTOCOL === 'Yes' ? 0.9985 : 1) *
  f.RECYCLABLE_PROPORTION_PERCENTAGE

/** The service compares a calculated field against its terms to within this. */
const TOLERANCE = 1e-9

describe('planSummaryLogRows', () => {
  it('plans every registration in the population', () => {
    assert.equal(
      plan.registrations.length,
      DEFAULT_CALIBRATION.register.registrations
    )
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

  it('credits the estate the tonnage the workbook reports for each worksheet', () => {
    for (const [stream, sheets] of Object.entries(
      DEFAULT_CALIBRATION.activity.summaryLogSheets
    )) {
      for (const [worksheet, { monthlyTonnage: published }] of Object.entries(
        sheets
      )) {
        if (published === undefined) continue
        const planned = monthlyTonnage(plan, stream, worksheet)
        assert.ok(
          Math.abs(planned - published) < published * 0.01,
          `${stream} ${worksheet} plans ${Math.round(planned)}t a month against ${published}t`
        )
      }
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
      const dates = Object.entries(row.fields).filter(
        ([marker]) => marker.startsWith('DATE_') || marker.startsWith('MONTH_')
      )
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
        for (const [marker, value] of Object.entries(row.fields)) {
          if (!marker.startsWith('DATE_') && !marker.startsWith('MONTH_'))
            continue
          const day = String(value).split('/').reverse().join('-')
          assert.ok(
            day >= accreditation.validFrom && day <= accreditation.validTo,
            `${registration.registrationId} ${marker} ${day} falls outside ${accreditation.validFrom}..${accreditation.validTo}`
          )
        }
      }
    }
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
      assert.equal(row.tonnage, f.TONNAGE_RECEIVED_FOR_RECYCLING)
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
      assert.equal(row.tonnage, f.TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED)
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
      assert.equal(row.tonnage, f.PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION)
    }
  })
})

describe('a planned row rendered into a workbook', () => {
  const tenth = planSummaryLogRows({
    population: planPopulation({ seed: SEED, scale: 0.1 })
  })

  for (const stream of STREAMS) {
    it(`names only fields a ${stream} template carries`, async () => {
      const registration = tenth.registrations.find((r) => r.stream === stream)
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
