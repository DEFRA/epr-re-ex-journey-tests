import { test, expect } from '@playwright/test'

import { DashboardPage } from 'page-objects/dashboard.page'
import { PRNViewPage } from 'page-objects/prn.view.page'
import { ReportViewPage } from 'page-objects/reports/report.view.page'
import { AccreditationDetailsPage } from 'page-objects/regulator/accreditation.details.page'
import { PrnsDetailedViewPage } from 'page-objects/regulator/prns.detailed-view.page'
import { ReportsDetailedViewPage } from 'page-objects/regulator/reports.detailed-view.page'
import { RegisteredOnlyPeriodPage } from 'page-objects/regulator/registered-only-period.page'
import { RegistrationDetailsPage } from 'page-objects/regulator/registration.details.page'
import { RegulatorHomePage } from 'page-objects/regulator/home.page'
import { RegulatorLoginPage } from 'page-objects/regulator/login.page'
import { RegulatorOrganisationPage } from 'page-objects/regulator/organisation.page'
import { ReportsPage } from 'page-objects/reports/reports.page'
import {
  LEDGER_TIMESTAMP,
  WasteBalanceLedgerPage
} from 'page-objects/waste.balance.ledger.page'
import { checkBodyText } from '../../support/checks.js'
import { currentYear } from '../../support/date.js'
import { SEEDED_VALID_FROM } from '../../support/seeding/organisation.js'
import { seedAwaitingPrnAndSubmittedReport } from '../../support/seeding/regulator-read.js'
import { registrationStartYear } from '../../support/seeding/summary-logs.js'

/**
 * The tonnage a row reads, as a number. Whether a table formats it to two
 * decimal places is that page's to choose, so the figure is what is compared
 * rather than the string it was written as.
 * @param {Map<string, string>} row
 * @returns {number}
 */
const tonnageOf = (row) => Number((row.get('Tonnage') ?? '').replace(/,/g, ''))

/**
 * The registered-only years the registration page offers. A registration has no
 * end date, so the set runs from the year the seed starts in to the current one
 * and grows every January - which is why it is derived rather than written down.
 * @returns {string[]}
 */
const seededRegisteredOnlyYears = () => {
  const firstYear = new Date(SEEDED_VALID_FROM).getUTCFullYear()

  return Array.from({ length: currentYear() - firstYear + 1 }, (_, offset) =>
    String(firstYear + offset)
  )
}

const ACCREDITATION_HEADING =
  /Accreditation\s+\d{1,2} [A-Z][a-z]+( \d{4})? to (Current|\d{1,2} [A-Z][a-z]+ \d{4})/

test.describe('A regulator reading a registration @regulator', () => {
  test('walks from the organisation list to a registration, reads what it covers and the periods it holds, then opens each kind and comes back, offered nothing to change @regulatorRegistration @regulatorAccreditation @regulatorRegisteredOnly @regulatorSearch', async ({
    page
  }) => {
    const loginPage = new RegulatorLoginPage(page)
    const homePage = new RegulatorHomePage(page)
    const dashboardPage = new DashboardPage(page)
    const detailsPage = new RegistrationDetailsPage(page)
    const accreditationPage = new AccreditationDetailsPage(page)
    const prnsPage = new PrnsDetailedViewPage(page)
    const reportsPage = new ReportsDetailedViewPage(page)
    const ledgerPage = new WasteBalanceLedgerPage(page)
    const organisationPage = new RegulatorOrganisationPage(page)
    const operatorReportsPage = new ReportsPage(page)
    const prnViewPage = new PRNViewPage(page)
    const registeredOnlyPage = new RegisteredOnlyPeriodPage(page)
    const reportViewPage = new ReportViewPage(page)

    const seeded = await seedAwaitingPrnAndSubmittedReport()

    const expectOnAccreditation = async () => {
      expect(await accreditationPage.headingText()).toMatch(
        ACCREDITATION_HEADING
      )
      expect(await accreditationPage.captionText()).toContain(
        seeded.accreditationNumber
      )
    }

    const expectOnRegistration = async () => {
      expect(await detailsPage.headingText()).toContain('Registration details')
      expect(await detailsPage.captionText()).toContain(
        seeded.registrationNumber
      )
    }

    await loginPage.loginAsRegulator()

    // A regulator holds no organisation id, so search is the only way in, and
    // the page they land on is the search itself.
    await homePage.searchFor(seeded.companyName)

    // The seeded company name carries a random suffix, so the whole result set
    // is one row - which asserts the size of it as well as the content.
    expect(await homePage.getTableData()).toEqual([
      {
        name: seeded.companyName,
        organisationId: `${seeded.orgId}`,
        regulator: 'EA',
        // Active rather than approved: the seed links the organisation to a
        // Defra ID so an operator can write the notes and the report this
        // journey goes on to read, and linking is what activates it.
        status: 'Active'
      }
    ])

    // The way into an organisation is its row's Actions link rather than its
    // name, so the link is named here: the whole-row compare above does not
    // see it.
    await expect(homePage.actionLink(1)).toHaveText(
      `View ${seeded.companyName}`
    )
    expect(await homePage.getActionHiddenText(1)).toBe(seeded.companyName)

    await homePage.actionLink(1).click()

    expect(await dashboardPage.dashboardHeaderText()).toContain(
      seeded.companyName
    )
    expect(await organisationPage.captionText()).toBe(seeded.companyName)

    // The record groups registrations under the site they are processed at,
    // and the seed registers one site - so counting the tables is what says
    // they were grouped rather than listed.
    await expect(organisationPage.siteTables()).toHaveCount(1)

    // This organisation reprocesses and does not export, so it is shown what
    // it has rather than tabs, one of which it would have to leave empty.
    await expect(organisationPage.tabs()).toHaveCount(0)

    // The whole row, keyed by the column that states it. Every row's link
    // reads "View", so the name it carries after that is the only thing saying
    // which registration this row opens.
    expect(await organisationPage.registrations()).toEqual([
      new Map([
        ['Registration number', seeded.registrationNumber],
        ['Registration status', 'Approved'],
        ['Material', 'Paper and board'],
        ['Regulator', 'EA'],
        ['Accreditation', `${SEEDED_VALID_FROM.slice(0, 4)}: Approved`],
        ['Actions', `View ${seeded.registrationNumber}`]
      ])
    ])

    await dashboardPage.selectLink(1)

    expect(await detailsPage.headingText()).toContain('Registration details')

    const caption = await detailsPage.captionText()
    expect(caption).toContain(seeded.companyName)
    expect(caption).toContain(seeded.registrationNumber)

    await expect(page).toHaveTitle(
      new RegExp(`${seeded.registrationNumber}: Registration details`)
    )

    const summary = await detailsPage.summary()

    expect(summary.Status).toBe('Approved')
    expect(summary['Processing type']).toBe('Reprocessor (input)')
    expect(summary.Material).toBe('Paper and board')

    // The seed's address is generated, so the row is asserted to be there and
    // to say something rather than to say one particular thing.
    expect(summary.Site).toBeTruthy()

    expect(Object.keys(summary)).toStrictEqual([
      'Status',
      'Processing type',
      'Material',
      'Site'
    ])

    const periods = await detailsPage.accreditedPeriods()

    expect([...periods[0].keys()]).toStrictEqual([
      'Accreditation number',
      'Date range',
      'Accreditation status',
      'Actions'
    ])

    expect(periods.map((period) => period.get('Accreditation number'))).toEqual(
      [seeded.accreditationNumber]
    )
    expect(periods[0].get('Accreditation status')).toBe('Approved')

    expect(periods[0].get('Date range')).toMatch(
      /^\d{1,2} [A-Z][a-z]+( \d{4})? to (Current|\d{1,2} [A-Z][a-z]+ \d{4})$/
    )

    await expect(detailsPage.actionLink(1)).toHaveText(
      `View ${seeded.accreditationNumber}`
    )
    expect(await detailsPage.getActionHiddenText(1)).toBe(
      seeded.accreditationNumber
    )

    expect(await detailsPage.breadcrumbs()).toStrictEqual([
      'All organisations',
      seeded.companyName,
      'Registration details'
    ])

    expect(await detailsPage.changeControlCount()).toBe(0)

    // Comparing the whole set of links is what says "and nothing else" - a
    // route added here later has to be justified rather than arriving
    // unnoticed. The design offers the accreditation and a year per
    // registered-only period, and none of the note list, the reports or the
    // ledger, compared by the words each link carries and sorted.
    expect(await detailsPage.offeredLinks()).toEqual(
      [
        `View ${seeded.accreditationNumber}`,
        ...seededRegisteredOnlyYears().map(
          (year) => `View reg-only period ${year}`
        )
      ].sort()
    )

    // No page a regulator reads links to the registration's reports list, so
    // it is reached by the registration's address, kept here to come back to.
    const registrationUrl = page.url()

    // The accredited period is the only way in, so opening it is what says the
    // link leads somewhere.
    await detailsPage.actionLink(1).click()

    // The caption sits inside the h1, so the heading is matched rather than
    // anchored. The period it names is what a regulator opened the page for,
    // and it sits on its own line beneath the title.
    expect(await accreditationPage.headingText()).toMatch(ACCREDITATION_HEADING)

    const accreditationCaption = await accreditationPage.captionText()
    expect(accreditationCaption).toContain(seeded.companyName)
    expect(accreditationCaption).toContain(seeded.registrationNumber)
    expect(accreditationCaption).toContain(seeded.accreditationNumber)

    await expect(page).toHaveTitle(
      new RegExp(`${seeded.accreditationNumber}: Accreditation details`)
    )

    const accreditationSummary = await accreditationPage.summary()

    expect(accreditationSummary['Accreditation status']).toBe('Approved')
    expect(accreditationSummary['Accreditation number']).toBe(
      seeded.accreditationNumber
    )

    // The seed submits a summary log and draws notes against it, so the balance
    // is a real tonnage. Its value belongs to the fixture rather than to this
    // page, so the format is what is pinned.
    expect(accreditationSummary['Waste balance available (tonnes)']).toMatch(
      /^\d{1,3}(,\d{3})*\.\d{2}$/
    )

    // The seed's summary log and the registration's records, offered as files.
    expect(accreditationSummary['Latest summary log']).toBe('Download')
    expect(accreditationSummary['Latest waste record CSV']).toBe('Download')

    // Comparing the whole set is what says "and nothing else". The total the
    // accreditation has ever held is deliberately not shown beside the
    // available figure, so it arriving here has to be justified rather than
    // pass unnoticed.
    expect(Object.keys(accreditationSummary)).toStrictEqual([
      'Accreditation status',
      'Accreditation number',
      'Waste balance available (tonnes)',
      'Latest summary log',
      'Latest waste record CSV'
    ])

    expect(await accreditationPage.breadcrumbs()).toStrictEqual([
      'All organisations',
      seeded.companyName,
      'Registration details',
      'Accreditation details'
    ])

    // A regulator reads and does not write, the same claim the registration
    // page above makes for itself.
    expect(await accreditationPage.changeControlCount()).toBe(0)

    // The reports table is the record of what the operator owed under this
    // accreditation and what arrived against it. The seed submitted one
    // report, for the last completed period, and left every earlier period
    // unreported - so the one table holds a row of each kind.
    const { year, period } = seeded.reportPeriod

    // The period the seed chose moves with the run date, so its label is
    // derived from what was seeded rather than written down.
    const monthName = new Date(Date.UTC(year, period - 1)).toLocaleString(
      'en-GB',
      { month: 'long', timeZone: 'UTC' }
    )
    const periodLabel = `${monthName}, ${year}`

    expect(await accreditationPage.reportHeadings()).toStrictEqual([
      'Period',
      'Due date',
      'Submission date',
      'Status',
      'Actions'
    ])

    const reports = await accreditationPage.reports()

    // The table and the empty state are alternatives, so the table rendering
    // is only half the claim - the message being absent is the other half.
    expect(await accreditationPage.noReportsMessage().count()).toBe(0)

    // The seeded period is the most recent one to have ended, so finding it
    // first is what says the table is ordered most recent period first.
    expect(reports[0].get('Period')).toBe(periodLabel)
    expect(reports[0].get('Due date')).toMatch(/^\d{1,2} [A-Z][a-z]+ \d{4}$/)
    expect(reports[0].get('Status')).toBe('Submitted')

    // The submission's timestamp belongs to the run rather than to this page,
    // so the row is asserted to carry one rather than to carry a given one.
    expect(reports[0].get('Submission date')).toBeTruthy()

    await expect(accreditationPage.reportActionLink(1)).toHaveText(
      `View ${periodLabel}`
    )

    // Every action link reads the same single word, so the period it names is
    // the only thing telling one row's link from another's.
    expect(await accreditationPage.getReportActionHiddenText(1)).toBe(
      periodLabel
    )

    // Earlier periods ended with nothing submitted against them, so the last
    // row is the other kind: a period that is owed rather than answered.
    expect(reports.length).toBeGreaterThan(1)

    const unreported = reports[reports.length - 1]

    expect(unreported.get('Submission date')).toBe('')
    expect(unreported.get('Status')).not.toBe('Submitted')
    expect(
      await accreditationPage.reportActionLink(reports.length).count()
    ).toBe(0)

    await accreditationPage.reportActionLink(1).click()

    const reportHeading = await reportViewPage.headingText()
    expect(reportHeading).toContain('Report for')
    expect(reportHeading).toContain(periodLabel)

    await reportViewPage.crumbLink('Accreditation details').click()
    await expectOnAccreditation()

    // The summary shows the most recent reports only, so the full list is
    // reached through the link beside it.
    expect(reports.length).toBeLessThanOrEqual(3)
    expect(await accreditationPage.reportsSubheadingText()).toContain(
      `(${reports.length} items)`
    )

    await expect(accreditationPage.reportsDetailedViewLink()).toBeVisible()
    await accreditationPage.reportsDetailedViewLink().click()

    await expect(reportsPage.detailedView()).toBeVisible()
    await reportsPage.expectYear(currentYear())

    const reportsCaption = await reportsPage.captionText()
    expect(reportsCaption).toContain(seeded.companyName)
    expect(reportsCaption).toContain(seeded.registrationNumber)
    expect(reportsCaption).toContain(seeded.accreditationNumber)

    expect(await reportsPage.breadcrumbs()).toStrictEqual([
      'All organisations',
      seeded.companyName,
      'Registration details',
      'Accreditation details',
      `Reports (${currentYear()})`
    ])

    // The same table as the summary's, so the same columns.
    expect(await reportsPage.reportHeadings()).toStrictEqual([
      'Period',
      'Due date',
      'Submission date',
      'Status',
      'Actions'
    ])

    const allReports = await reportsPage.reports()

    // Uncapped, so it holds at least what the summary did, in the same order.
    expect(allReports.length).toBeGreaterThanOrEqual(reports.length)
    expect(allReports[0].get('Period')).toBe(periodLabel)
    expect(allReports[0].get('Status')).toBe('Submitted')

    expect(await reportsPage.changeControlCount()).toBe(0)

    // A regulator page offers breadcrumbs or a back link, never both.
    expect(await reportsPage.backLink().count()).toBe(0)

    await reportsPage.crumbLink('Accreditation details').click()
    await expectOnAccreditation()

    await expect(accreditationPage.prnsHeading()).toBeVisible()

    expect(await accreditationPage.noPrnsMessage().count()).toBe(0)

    // The whole set, so a material column arriving would have to be justified.
    expect(await accreditationPage.prnHeadings()).toStrictEqual([
      'Producer or compliance scheme',
      'Status',
      'Date',
      'Tonnage',
      'Action'
    ])

    const summaryNotes = await accreditationPage.prns()

    expect(summaryNotes).toHaveLength(2)

    // The two seeded notes differ by tonnage, so order does not matter here.
    expect(summaryNotes.map(tonnageOf).sort((a, b) => a - b)).toStrictEqual(
      [seeded.prnTonnage, seeded.cancellationPrnTonnage].sort((a, b) => a - b)
    )

    expect(summaryNotes.map((note) => note.get('Status')).sort()).toStrictEqual(
      ['Awaiting authorisation', 'Awaiting cancellation']
    )

    expect(await accreditationPage.prnsSubheadingText()).toContain('(2 items)')

    // Opening a note from here and coming back is the half of the criterion
    // the full list below cannot cover.
    await accreditationPage.prnActionLink(1).click()

    await expect(prnViewPage.heading()).toHaveText(
      'Packaging Waste Recycling Note'
    )

    await prnViewPage.crumbLink('Accreditation details').click()

    expect(await accreditationPage.captionText()).toContain(
      seeded.accreditationNumber
    )

    await accreditationPage.prnsDetailedViewLink().click()

    // The regulator's page, not the operator's list at the same address. The
    // tabs and tables below are the operator's, shared so a note reads alike.
    await expect(prnsPage.detailedView()).toBeVisible()

    const prnsCaption = await prnsPage.captionText()
    expect(prnsCaption).toContain(seeded.companyName)
    expect(prnsCaption).toContain(seeded.registrationNumber)
    expect(prnsCaption).toContain(seeded.accreditationNumber)

    expect(await prnsPage.breadcrumbs()).toStrictEqual([
      'All organisations',
      seeded.companyName,
      'Registration details',
      'Accreditation details',
      `PRNs (${registrationStartYear()})`
    ])

    const awaitingLink = prnsPage.awaitingLink(1)
    await awaitingLink.waitFor()

    const awaitingRow = await prnsPage.getAwaitingRow(1)

    expect(awaitingRow.get('Status')).toBe('Awaiting authorisation')
    expect(awaitingRow.get('Tonnage')).toBe(`${seeded.prnTonnage}`)

    // A regulator gets the read link the operator's write-scoped session does
    // not, which is the whole of what the fork changes about the tables.
    expect(await awaitingLink.innerText()).toBe('View')

    const cancellationRow = await prnsPage.getAwaitingRow(1, 2)

    expect(cancellationRow.get('Status')).toBe('Awaiting cancellation')
    expect(cancellationRow.get('Tonnage')).toBe(
      `${seeded.cancellationPrnTonnage}`
    )

    expect(await prnsPage.changeControlCount()).toBe(0)

    // A note awaiting cancellation appears nowhere else, so an empty cell here
    // would strand it.
    const cancellationLink = prnsPage.awaitingLink(1, 2)
    expect(await cancellationLink.innerText()).toBe('View')

    await cancellationLink.click()
    await checkBodyText(page, seeded.cancellationPrnNumber, 10)
    await prnViewPage.crumbLink(`PRNs (${registrationStartYear()})`).click()

    await awaitingLink.click()

    await expect(prnViewPage.heading()).toHaveText(
      'Packaging Waste Recycling Note'
    )

    // The accreditation the note was drawn against. The note's own page is the
    // only page in this journey that renders it, so it says the note rendered
    // rather than the list still being on screen.
    await checkBodyText(page, seeded.accreditationNumber, 10)

    // The issue button posts to this same page, so its form is counted
    // separately.
    await expect(prnViewPage.backLink()).toBeHidden()
    await expect(prnViewPage.returnToPRNList()).toBeHidden()
    expect(await prnViewPage.formCount()).toBe(0)

    // A note still awaiting authorisation has no number yet, so the last crumb
    // names it by its id, as the page title does.
    expect(await prnViewPage.breadcrumbs()).toEqual([
      'All organisations',
      seeded.companyName,
      'Registration details',
      'Accreditation details',
      `PRNs (${registrationStartYear()})`,
      seeded.prnId
    ])

    await prnViewPage.crumbLink(`PRNs (${registrationStartYear()})`).click()
    await expect(prnsPage.detailedView()).toBeVisible()

    expect(await prnsPage.backLink().count()).toBe(0)

    await prnsPage.crumbLink('Accreditation details').click()
    await expectOnAccreditation()

    await page.goto(`${registrationUrl}/reports`)

    await operatorReportsPage.expectListFor(currentYear(), 'Reports')

    // The last completed period is the one the seed submitted, so it is the
    // only row the Submitted section holds.
    await operatorReportsPage.expectSubmittedActionLink(1, 'View')

    // Every remaining period still needs a report, so each row's action is a
    // write one. The rows are there and none of them is a link.
    expect(await operatorReportsPage.getActiveNumberOfRows()).toBeGreaterThan(0)
    expect(await operatorReportsPage.getActiveNumberOfActionLinks()).toBe(0)

    await operatorReportsPage.selectSubmittedActionLink(1)

    expect(await reportViewPage.headingText()).toContain(`${year}`)
    expect(await reportViewPage.hasMakeChangesLink()).toBe(false)

    await reportViewPage.crumbLink('Accreditation details').click()
    await expectOnAccreditation()

    // The ledger the balance above moved in. The seed made five movements and
    // the section shows the most recent events only, so what is here is the
    // cap rather than the whole record.
    const ledgerEvents = await ledgerPage.eventRows()

    expect(ledgerEvents).toHaveLength(3)

    await accreditationPage.ledgerDetailedViewLink().click()

    // The caption sits inside the h1, so the heading carries it.
    const ledgerHeading = ledgerPage.heading()
    await expect(ledgerHeading).toContainText(seeded.companyName)
    await expect(ledgerHeading).toContainText(seeded.registrationNumber)
    await expect(ledgerHeading).toContainText(seeded.accreditationNumber)

    expect(await ledgerPage.breadcrumbs()).toStrictEqual([
      'All organisations',
      seeded.companyName,
      'Registration details',
      'Accreditation details',
      'Waste balance ledger'
    ])

    // Uncapped, so it holds at least what the section did.
    const allLedgerEvents = await ledgerPage.eventRows()
    expect(allLedgerEvents.length).toBeGreaterThanOrEqual(ledgerEvents.length)

    // A regulator page offers breadcrumbs or a back link, never both.
    expect(await ledgerPage.backLink().count()).toBe(0)

    // The six columns the ledger states, in the order it states them. The
    // rows below are keyed by these headings, so naming them here is what
    // stops a renamed column reading as a missing cell.
    expect([...allLedgerEvents[0].keys()]).toEqual([
      'Date',
      'Event',
      'Tonnage',
      'Waste balance available (tonnes)',
      'Who',
      'Actions'
    ])

    // Every movement the seed made, newest first. The summary log opens the
    // balance, the first note is drawn against it, and the second is drawn,
    // issued and then rejected by the recipient. A note is given its number
    // when it is issued, and the ledger states the number the note carries now
    // against every movement it caused - so the rejected note names itself on
    // all three of its rows, and the note still awaiting authorisation names
    // itself on none. The number sits on a second line under the event.
    const { cancellationPrnNumber } = seeded

    expect(allLedgerEvents.map((event) => event.get('Event'))).toEqual([
      `PRN rejected\n${cancellationPrnNumber}`,
      `PRN issued\n${cancellationPrnNumber}`,
      `PRN created\n${cancellationPrnNumber}`,
      'PRN created',
      'Summary log submitted'
    ])

    // Drawing a note takes its tonnage out of the balance and the summary log
    // put it there, so the two read opposite ways round; issuing a note settles
    // an amount already held back and rejecting one settles nothing, so neither
    // moves the balance. The two notes are drawn for different amounts, so a
    // row names which note it is.
    expect(allLedgerEvents.map((event) => event.get('Tonnage'))).toEqual([
      'N/A',
      'N/A',
      `-${seeded.cancellationPrnTonnage}.00`,
      `-${seeded.prnTonnage}.00`,
      `+${seeded.summaryLogCredit}`
    ])

    // The page carries no sequence number, so on a ledger whose events span
    // more than one day the time is the only thing that separates two of them.
    // toStrictEqual rather than toEqual, because toEqual drops an undefined
    // entry and would read a table with no such column as a clean pass.
    const undated = allLedgerEvents
      .map((event) => event.get('Date'))
      .filter((cell) => cell === undefined || !LEDGER_TIMESTAMP.test(cell))

    expect(undated).toStrictEqual([])

    // The summary log offers its own file rather than a note. The seed stores
    // no workbook, so the records the service holds for the submission are the
    // download that can be taken.
    expect(allLedgerEvents[4].get('Actions')).toContain('Download')
    const records = await ledgerPage.download(ledgerPage.csvDownloadLink())
    expect(records.failure).toBeNull()
    expect(records.byteLength).toBeGreaterThan(0)
    expect(records.filename).toMatch(/\.csv$/)

    // Reading a movement and then reading the note behind it is the journey
    // this page exists for. The rejection is the newest movement, so its row
    // is the first one, and the note names itself.
    await ledgerPage.viewNoteLinks(cancellationPrnNumber).first().click()
    await checkBodyText(page, cancellationPrnNumber, 10)

    // Reached from the ledger rather than the list, the note is a second way
    // in that has to land somewhere read-only too.
    expect(await prnViewPage.formCount()).toBe(0)

    await prnViewPage.crumbLink('Accreditation details').click()
    await expectOnAccreditation()

    // Getting back to the registration is an acceptance criterion, so the
    // crumb is followed rather than merely asserted to be present.
    await accreditationPage.crumbLink('Registration details').click()
    await expectOnRegistration()

    // The registration also lists the years it ran over without an
    // accreditation. The seed grants both from the same date, so the year this
    // opens holds nothing - which is the acceptance criterion this journey is
    // here for.
    const registeredOnly = await detailsPage.registeredOnlyPeriods()

    expect([...registeredOnly[0].keys()]).toStrictEqual(['Period', 'Actions'])

    // A registration has no end date, so the list runs to the current year and
    // grows every January. The row the journey opens is the seeded start year,
    // found rather than assumed to be first.
    const seededYear = new Date(SEEDED_VALID_FROM).getUTCFullYear()
    const seededRow =
      registeredOnly.findIndex(
        (row) => row.get('Period') === String(seededYear)
      ) + 1

    expect(seededRow).toBeGreaterThan(0)

    expect(
      await detailsPage.registeredOnlyActionLink(seededRow).innerText()
    ).toContain('View reg-only period')

    // Every action link reads the same two words, so the year it names is the
    // only thing telling one row's link from another's.
    expect(await detailsPage.getRegisteredOnlyHiddenText(seededRow)).toBe(
      String(seededYear)
    )

    await detailsPage.registeredOnlyActionLink(seededRow).click()

    expect(await registeredOnlyPage.headingText()).toContain(
      `${seededYear} Registered-only periods`
    )

    await expect(page).toHaveTitle(
      new RegExp(`${seededYear} Registered-only periods`)
    )

    const registeredOnlyCaption = await registeredOnlyPage.captionText()
    expect(registeredOnlyCaption).toContain(seeded.companyName)
    expect(registeredOnlyCaption).toContain(seeded.registrationNumber)

    // The seed is accredited from the day the registration starts, so this
    // period holds no data and says so in both sentences.
    await expect(registeredOnlyPage.noDataMessage()).toBeVisible()
    await expect(registeredOnlyPage.returnToRegistrationMessage()).toBeVisible()

    expect(await registeredOnlyPage.breadcrumbs()).toStrictEqual([
      'All organisations',
      seeded.companyName,
      'Registration details',
      `${seededYear} Registered-only periods`
    ])

    expect(await registeredOnlyPage.changeControlCount()).toBe(0)

    // Getting back is an acceptance criterion here too, so the crumb is
    // followed rather than asserted to be present.
    await registeredOnlyPage.crumbLink('Registration details').click()
    await expectOnRegistration()
  })
})
