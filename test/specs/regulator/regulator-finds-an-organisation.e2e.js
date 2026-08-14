import { test, expect } from '@playwright/test'

import { DashboardPage } from 'page-objects/dashboard.page'
import { PRNDashboardPage } from 'page-objects/prn.dashboard.page'
import { PRNViewPage } from 'page-objects/prn.view.page'
import { RegulatorHomePage } from 'page-objects/regulator/home.page'
import { RegulatorLoginPage } from 'page-objects/regulator/login.page'
import { ReportsPage } from 'page-objects/reports/reports.page'
import { ReportViewPage } from 'page-objects/reports/report.view.page'
import { WasteRecordsPage } from 'page-objects/waste.records.page'
import {
  createLinkedOrganisation,
  FAKE_ACCREDITATION_NUMBER,
  FAKE_REGISTRATION_NUMBER,
  updateMigratedOrganisation
} from '../../support/apicalls.js'
import { checkBodyText } from '../../support/checks.js'
import { seedAwaitingPrnAndSubmittedReport } from '../../support/regulator-read-seed.js'

test.describe('A regulator looking up an operator @regulator', () => {
  test('finds an organisation by name, reads it, and is offered nothing to change @regulatorsearch', async ({
    page
  }) => {
    const loginPage = new RegulatorLoginPage(page)
    const homePage = new RegulatorHomePage(page)
    const dashboardPage = new DashboardPage(page)
    const registrationPage = new WasteRecordsPage(page)

    const linkedOrganisation = await createLinkedOrganisation([
      { material: 'Paper or board (R3)', wasteProcessingType: 'Reprocessor' }
    ])

    // Numbering the registration approves it, which is the state a regulator
    // has any reason to look at, and is what the Status column reads back.
    await updateMigratedOrganisation(linkedOrganisation.refNo, [
      {
        regNumber: FAKE_REGISTRATION_NUMBER,
        accNumber: FAKE_ACCREDITATION_NUMBER,
        status: 'approved',
        reprocessingType: 'input'
      }
    ])

    const { organisation } = linkedOrganisation

    await loginPage.loginAsRegulator()

    // A regulator holds no organisation id, so search is the only way in, and
    // the page they land on is the search itself.
    await homePage.searchFor(organisation.companyName)

    // The seeded company name carries a random suffix, so the whole result set
    // is one row - which asserts the size of it as well as the content.
    expect(await homePage.getTableData()).toEqual([
      {
        name: organisation.companyName,
        organisationId: `${linkedOrganisation.orgId}`,
        regulator: 'EA',
        // Approved rather than active: the organisation is never linked to a
        // Defra ID, which is what makes an approved organisation active.
        status: 'approved'
      }
    ])

    await homePage.openOrganisation(1)

    expect(await dashboardPage.dashboardHeaderText()).toContain(
      organisation.companyName
    )
    expect(await dashboardPage.getMaterial(1, 1)).toBe('Paper and board')
    expect(await dashboardPage.getRegistrationStatus(1, 1)).toBe('Approved')
    expect(await dashboardPage.getAccreditationStatus(1, 1)).toBe('Approved')

    await dashboardPage.selectLink(1)

    // The registration is where an operator issues PRNs, reports and reapplies
    // for accreditation. A regulator reads the same page and is offered the
    // PRNs and the reports to read, and nothing that changes either. Comparing
    // the whole set is what says "and nothing else" - a route added here later
    // has to be justified rather than arriving unnoticed.
    expect(await registrationPage.offeredRoutes()).toEqual([
      '/contact',
      '/organisations/{id}/registrations/{id}/accreditations/{id}/packaging-recycling-notes',
      '/organisations/{id}/registrations/{id}/reports'
    ])
  })

  test('follows both links, reads the notes and the report, and is offered nothing to change @regulatorreads', async ({
    page
  }) => {
    const loginPage = new RegulatorLoginPage(page)
    const homePage = new RegulatorHomePage(page)
    const dashboardPage = new DashboardPage(page)
    const registrationPage = new WasteRecordsPage(page)
    const prnListPage = new PRNDashboardPage(page)
    const prnViewPage = new PRNViewPage(page)
    const reportsPage = new ReportsPage(page)
    const reportViewPage = new ReportViewPage(page)

    const seeded = await seedAwaitingPrnAndSubmittedReport()

    await loginPage.loginAsRegulator()
    await homePage.searchFor(seeded.companyName)
    await homePage.openOrganisation(1)
    await dashboardPage.selectLink(1)

    // The reports half of the journey starts here again, and a regulator holds
    // no record ids to build the path from - so keep the one the search found.
    // Settle on the summary cards first: the click above does not promise the
    // registration page has loaded, and a URL read taken early would send the
    // second half of this journey to the organisation dashboard instead.
    await registrationPage.registrationAndAccreditationCard().waitFor()
    const registrationUrl = page.url()

    await registrationPage.managePRNsLink()

    // The note awaits authorisation, and the awaiting tables are the only
    // place such a note is filed. Reading the tonnage back off the row is what
    // says the list rendered the operator's note rather than an empty section.
    // The row read takes the DOM as it stands with no auto-wait, so settle on
    // the row's action link before it.
    const awaitingLink = prnListPage.awaitingLink(1)
    await awaitingLink.waitFor()

    const awaitingRow = await prnListPage.getAwaitingRow(1)
    expect(awaitingRow.get('Tonnage')).toBe(`${seeded.prnTonnage}`)

    expect(await awaitingLink.innerText()).toBe('View')
    expect(await awaitingLink.getAttribute('href')).toContain(
      `/packaging-recycling-notes/${seeded.prnId}/view`
    )

    // The awaiting-cancellation table is the second one in the same tab and is
    // built by the same code, so it takes the same decision about what a
    // session may do. A note awaiting cancellation appears nowhere else
    // either, so an empty cell here would strand it.
    const cancellationRow = await prnListPage.getAwaitingRow(1, 2)
    expect(cancellationRow.get('Tonnage')).toBe(
      `${seeded.cancellationPrnTonnage}`
    )

    const cancellationLink = prnListPage.awaitingLink(1, 2)
    expect(await cancellationLink.innerText()).toBe('View')
    expect(await cancellationLink.getAttribute('href')).toContain(
      `/packaging-recycling-notes/${seeded.cancellationPrnId}/view`
    )

    await prnListPage.selectAwaitingLink(1)

    // The accreditation the note was drawn against. The note's own page is the
    // only page in this journey that renders it, so it says the note rendered
    // rather than the list still being on screen.
    await checkBodyText(page, seeded.accreditationNumber, 10)

    // Back to the list is the only route the note offers a reader. The issue
    // button posts to this same page, so its form is counted separately.
    expect(await prnViewPage.offeredRoutes()).toEqual([
      '/organisations/{id}/registrations/{id}/accreditations/{id}/packaging-recycling-notes'
    ])
    expect(await prnViewPage.formCount()).toBe(0)

    await page.goto(registrationUrl)
    await registrationPage.manageReportsLink()

    expect(await reportsPage.headingText()).toContain('Reports')

    // The last completed period is the one the seed submitted, so it is the
    // only row the Submitted section holds - and the link it keeps names that
    // period, which says the calendar rendered the operator's own submission.
    const { year, cadence, period } = seeded.reportPeriod
    await reportsPage.expectSubmittedActionLink(1, 'View report')
    expect(await reportsPage.getSubmittedActionLinkHref(1)).toContain(
      `/reports/${year}/${cadence}/${period}/submissions/1/view`
    )

    // Every remaining period still needs a report, so each row's action is a
    // write one. The rows are there and none of them is a link.
    expect(await reportsPage.getActiveNumberOfRows()).toBeGreaterThan(0)
    expect(await reportsPage.getActiveNumberOfActionLinks()).toBe(0)

    await reportsPage.selectSubmittedActionLink(1)

    // The submitted report's own heading names the period it covers, so it
    // says both that the report rendered and that it is the seeded one.
    expect(await reportViewPage.headingText()).toContain(`${year}`)
    expect(await reportViewPage.hasMakeChangesLink()).toBe(false)
  })
})
