import { readFile } from 'node:fs/promises'

import { test, expect } from '@playwright/test'

import { MarketInsightsPage } from 'page-objects/regulator/market-insights.page'
import { RegulatorHomePage } from 'page-objects/regulator/home.page'
import { RegulatorLoginPage } from 'page-objects/regulator/login.page'
import { seedAwaitingPrnAndSubmittedReport } from '../../support/seeding/regulator-read.js'

// The zip names itself for the period it covers and the moment the data was
// taken, so a regulator holding two of them can tell which is which.
const EXPORT_FILENAME =
  /^market-insights-\d{4}-monthly-\d{1,2}-\d{4}-\d{2}-\d{2}-\d{6}\.zip$/

// The four bytes every zip opens with. Reading them is what says the download
// is an archive rather than an error page served under the right name.
const ZIP_MAGIC = 'PK'

// Every file the export carries: the waste balance, a reprocessor and an
// exporter file for the UK and each nation, the outstanding returns, how
// complete the figures are, and what the edition is.
//
// A zip stores each entry's name uncompressed, so the names can be read
// straight out of the archive. That is why this journey needs no zip library
// to say which files arrived.
const EXPECTED_ENTRIES = [
  'waste-balance.csv',
  'uk-reprocessor.csv',
  'uk-exporter.csv',
  'england-reprocessor.csv',
  'england-exporter.csv',
  'wales-reprocessor.csv',
  'wales-exporter.csv',
  'scotland-reprocessor.csv',
  'scotland-exporter.csv',
  'northern-ireland-reprocessor.csv',
  'northern-ireland-exporter.csv',
  'outstanding-returns.csv',
  'reports.csv',
  'manifest.csv'
]

// The export builds every figure behind the pages before a byte is sent, so it
// answers in tens of seconds rather than the fraction a page load takes.
const BUILD_TIMEOUT_MS = 150_000

test.describe('A regulator downloading the market insights export @regulator', () => {
  test.setTimeout(BUILD_TIMEOUT_MS + 30_000)

  test('takes every figure away as one zip @regulatorMarketInsightsExport', async ({
    page
  }) => {
    const homePage = new RegulatorHomePage(page)
    const loginPage = new RegulatorLoginPage(page)
    const marketInsightsPage = new MarketInsightsPage(page)

    // The export reads the same figures the pages show, so it needs the same
    // seed: a summary log submitted against an approved accreditation is what
    // puts tonnage in the waste balance.
    await seedAwaitingPrnAndSubmittedReport()

    await loginPage.loginAsRegulator()

    expect(await homePage.getHeadingText()).toBe('All organisations')

    // Typing the address is not the journey. The regulator area offering the
    // link is the only way a regulator finds the page at all.
    await homePage.marketInsightsLink().click()

    expect(await marketInsightsPage.headingText()).toContain('Market insights')

    // The listener is armed before the click: the response carries
    // Content-Disposition, so the browser starts a download rather than
    // navigating, and the event fires once the build is done.
    const downloading = page.waitForEvent('download', {
      timeout: BUILD_TIMEOUT_MS
    })

    await marketInsightsPage.exportLink().click()

    const download = await downloading

    expect(download.suggestedFilename()).toMatch(EXPORT_FILENAME)

    // latin1 maps each byte to one character, so the entry names read out of
    // the archive as they were written into it.
    const archive = await readFile(await download.path(), 'latin1')

    expect(archive.startsWith(ZIP_MAGIC)).toBe(true)

    // Naming the files that are missing beats reporting that one of them was.
    expect(
      EXPECTED_ENTRIES.filter((entry) => !archive.includes(entry))
    ).toEqual([])
  })
})
