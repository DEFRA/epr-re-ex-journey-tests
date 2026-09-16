import { test, expect } from '@playwright/test'

import { MarketInsightsPage } from 'page-objects/regulator/market-insights.page'
import { RegulatorHomePage } from 'page-objects/regulator/home.page'
import { RegulatorLoginPage } from 'page-objects/regulator/login.page'
import {
  assertNoSeriousOrCriticalViolations,
  scanPageForAccessibilityViolations,
  tagAccessibilityTest
} from '../../support/accessibility.js'
import { seedAwaitingPrnAndSubmittedReport } from '../../support/seeding/regulator-read.js'

// The page lays the reporting months out as columns, running from January of
// the reporting year. Naming them here is what lets the journey say the
// columns arrived in calendar order with none missing, without deciding for
// itself which month the period should stop at.
const MONTHS_OF_THE_YEAR = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
]

// A tonnage as the page states one: two decimal places, and thousands grouped.
const TONNAGE = /^-?\d{1,3}(,\d{3})*\.\d{2}$/

// A report count as the page states one: how many were submitted of how many
// were expected.
const REPORT_COUNT = /^\d+ of \d+$/

// When a set of figures was taken, as the page stamps it.
const DATA_TAKEN_AT = /^Data taken at .+ on .+$/

/**
 * The value a stated tonnage carries. The grouping is there to be read rather
 * than parsed, so it comes out before the number does.
 * @param {string} figure
 * @returns {number}
 */
const asNumber = (figure) => Number(figure.replaceAll(',', ''))

test.describe('A regulator reading market insights @regulator', () => {
  test('follows the link out of the regulator area and reads the waste balance figures @regulatorMarketInsights', async ({
    page
  }) => {
    const homePage = new RegulatorHomePage(page)
    const loginPage = new RegulatorLoginPage(page)
    const marketInsightsPage = new MarketInsightsPage(page)
    const violations = []

    await tagAccessibilityTest('Regulator Market insights page')

    // The figures are the UK's rather than one operator's, so the seed is not
    // asserted back by name. What it is here for is tonnage: a summary log
    // submitted against an approved accreditation is what credits the waste
    // balance, and without one the page has a period but no table to show for
    // it.
    await seedAwaitingPrnAndSubmittedReport()

    await loginPage.loginAsRegulator()

    expect(await homePage.getHeadingText()).toBe('All organisations')

    // Typing the address is not the journey. The regulator area offering the
    // link is the only way a regulator finds the page at all.
    await homePage.marketInsightsLink().click()

    await expect(page).toHaveURL(/\/regulators\/market-insights$/)

    // The caption renders inside the heading, so it comes back with it. The
    // two are pinned apart: the words the page calls itself by here, and the
    // period below.
    expect(await marketInsightsPage.headingText()).toContain('Market insights')

    expect(await marketInsightsPage.captionText()).toMatch(
      /^[A-Z][a-z]+( to [A-Z][a-z]+)? \d{4}$/
    )

    // Collecting the stamps that fail names them in the failure instead of
    // reporting that one of them did.
    const dataTakenAt = await marketInsightsPage.dataTakenAtTexts()

    expect(dataTakenAt.length).toBeGreaterThan(0)
    expect(dataTakenAt.filter((stamp) => !DATA_TAKEN_AT.test(stamp))).toEqual(
      []
    )

    expect(await marketInsightsPage.tableCaptionText()).toBe('Waste balance')

    const headings = await marketInsightsPage.columnHeadings()
    const months = headings.slice(2, -1)

    expect([headings[0], headings[1], headings.at(-1)]).toEqual([
      'Material',
      'Accreditation type',
      'Total'
    ])

    // The columns run from January to the last complete month, so they are the
    // opening stretch of the calendar with nothing skipped.
    expect(months.length).toBeGreaterThan(0)
    expect(months).toEqual(MONTHS_OF_THE_YEAR.slice(0, months.length))

    // The seeded operator reprocesses, so its tonnage reaches the page under
    // that accreditation type. Other journeys seed their own operators while
    // this one runs, so the column is read whole rather than by row.
    expect(await marketInsightsPage.accreditationTypes()).toContain(
      'Reprocessor'
    )

    // Every cell states a tonnage to two decimal places, grouped in thousands,
    // including the months a row credited nothing, which the publication
    // prints as zero rather than leaving blank. Collecting the cells that fail
    // names them in the failure instead of reporting that one of them did.
    const figures = await marketInsightsPage.figures()

    expect(figures.filter((figure) => !TONNAGE.test(figure))).toEqual([])

    // The seeded summary log credits a complete month of the reporting year,
    // so the page is showing real tonnage rather than a table of zeroes.
    expect(figures.some((figure) => asNumber(figure) > 0)).toBe(true)

    // Beneath the figures, each month says how many of the monthly reports it
    // expected the figures include, and the period says the same under the
    // total, so a thin month can be told from one whose reporters have not
    // all filed.
    const reportCounts = await marketInsightsPage.reportCounts()

    expect(reportCounts).toHaveLength(months.length + 1)
    expect(reportCounts.filter((count) => !REPORT_COUNT.test(count))).toEqual(
      []
    )

    violations.push(
      ...(await scanPageForAccessibilityViolations(
        page,
        'Regulator market insights'
      ))
    )

    await assertNoSeriousOrCriticalViolations(violations)
  })
})
