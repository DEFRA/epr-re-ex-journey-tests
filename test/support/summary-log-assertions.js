import { expect } from 'chai'

// Shared assertion helpers for summary-log response bodies (the `loads`,
// `loadsByWasteRecordType`, `loadsByReportingPeriod` and `validation`
// structures returned by GET .../summary-logs/{id}). Mirrors the assertion
// logic in epr-backend-journey-tests' summarylogs.steps.js, translated from
// Cucumber data tables into plain JS objects/arrays.

export function assertLoads(loads, expectedLoads) {
  for (const { loadType, count, rowIds } of expectedLoads) {
    const actual = loadType.split('.').reduce((acc, key) => acc?.[key], loads)
    expect(actual.count).to.equal(count, `Failed at ${loadType}`)
    expect(actual.rowIds.join(',')).to.equal(rowIds, `Failed at ${loadType}`)
  }
}

export function assertLoadsByWasteRecordType(
  loadsByWasteRecordType,
  wasteRecordType,
  expectedLoads
) {
  const entry = loadsByWasteRecordType?.find(
    (item) => item.wasteRecordType === wasteRecordType
  )
  if (!entry) {
    expect.fail(
      `Expected loadsByWasteRecordType entry for '${wasteRecordType}' but not found. Actual entries: ${JSON.stringify(loadsByWasteRecordType?.map((e) => e.wasteRecordType))}`
    )
  }
  for (const { loadType, count, rowIds } of expectedLoads) {
    const actual = loadType.split('.').reduce((acc, key) => acc?.[key], entry)
    expect(actual.count).to.equal(
      count,
      `Failed at ${wasteRecordType}.${loadType}`
    )
    expect(actual.rowIds.join(',')).to.equal(
      rowIds,
      `Failed at ${wasteRecordType}.${loadType}`
    )
  }
}

export function assertReportingPeriodLoads(loadsByReportingPeriod, expected) {
  for (const [key, value] of Object.entries(expected)) {
    const actual = key
      .split('.')
      .reduce((acc, k) => acc?.[k], loadsByReportingPeriod)
    expect(actual).to.equal(value, `Failed at ${key}: got ${actual}`)
  }
}

export function assertReportingPeriodBucketRows(
  loadsByReportingPeriod,
  expectedRows
) {
  for (const expected of expectedRows) {
    const bucket = expected.bucket
      .split('.')
      .reduce((acc, k) => acc?.[k], loadsByReportingPeriod)

    const actualRow = bucket?.rows?.find((row) => row.rowId === expected.rowId)
    if (!actualRow) {
      expect.fail(
        `Expected row ${expected.rowId} in bucket ${expected.bucket} but found rows: ${JSON.stringify(bucket?.rows)}`
      )
    }
    expect(actualRow.wasteRecordType).to.equal(
      expected.wasteRecordType,
      `Failed wasteRecordType at ${expected.bucket} row ${expected.rowId}`
    )
    expect(actualRow.exclusionReasons.join(',')).to.equal(
      expected.exclusionReasons ?? '',
      `Failed exclusionReasons at ${expected.bucket} row ${expected.rowId}`
    )
    expect(actualRow.tonnageDelta).to.equal(
      expected.tonnageDelta,
      `Failed tonnageDelta at ${expected.bucket} row ${expected.rowId}`
    )
  }
}

// expected: array of { code, field?, sheet?, table?, row?, rowId?, header?, actual? }
// Only keys present on an expected entry are checked against each failure.
export function assertValidationFailures(failures, expected) {
  expect(failures.length).to.equal(
    expected.length,
    `Number of actual validation failures does not match expected value. Actual: ${JSON.stringify(failures)}`
  )

  const fieldMap = {
    code: 'code',
    field: 'location.field',
    sheet: 'location.sheet',
    table: 'location.table',
    rowId: 'location.rowId',
    row: 'location.row',
    header: 'location.header',
    actual: 'actual'
  }

  for (const expectedResult of expected) {
    const matchingFailure = failures.find((failure) => {
      return Object.entries(expectedResult).every(([key, value]) => {
        const actualPath = fieldMap[key]
        const actualValue = actualPath.includes('.')
          ? actualPath.split('.').reduce((obj, k) => obj?.[k], failure)
          : failure[actualPath]
        return `${actualValue}` === `${value}`
      })
    })

    if (!matchingFailure) {
      expect.fail(
        `Expected validation ${JSON.stringify(expectedResult)} but no failures found with those values. Actual validation values found: ${JSON.stringify(failures)}`
      )
    }
  }
}

export function assertValidationConcerns(concerns, table, row, expectedIssues) {
  const tableConcerns = concerns?.[table]
  // eslint-disable-next-line no-unused-expressions
  expect(tableConcerns).to.not.be.undefined

  const matchingRow = tableConcerns.rows.find(
    (actualRow) => actualRow.row === row
  )
  if (!matchingRow) {
    expect.fail(
      `Expected row ${row} but no row found with those values. Actual row values found: ${JSON.stringify(tableConcerns.rows.map((r) => r.row))}`
    )
  }

  const fieldMap = {
    type: 'type',
    code: 'code',
    header: 'header',
    column: 'column',
    actual: 'actual'
  }

  for (const expected of expectedIssues) {
    const matchingIssue = matchingRow.issues.find((issue) => {
      return Object.entries(expected).every(([key, value]) => {
        return issue[fieldMap[key]] === value
      })
    })
    if (!matchingIssue) {
      expect.fail(
        `Expected validation ${JSON.stringify(expected)} but no concerns found with those values. Actual: ${JSON.stringify(matchingRow.issues)}`
      )
    }
  }
}
