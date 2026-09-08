import { test, expect } from '@playwright/test'
import { CreatePRNPage } from 'page-objects/create.prn.page.js'
import { HomePage } from 'page-objects/homepage.js'
import { PRNCreatedPage } from 'page-objects/prn.created.page.js'
import { PRNDashboardPage } from 'page-objects/prn.dashboard.page.js'
import { PRNIssuedPage } from 'page-objects/prn.issued.page.js'
import { PRNViewPage } from 'page-objects/prn.view.page.js'
import { AccreditationDetailsPage } from 'page-objects/regulator/accreditation.details.page.js'
import { PrnsDetailedViewPage } from 'page-objects/regulator/prns.detailed-view.page.js'
import { RegistrationDetailsPage } from 'page-objects/regulator/registration.details.page.js'
import { RegulatorHomePage } from 'page-objects/regulator/home.page.js'
import { RegulatorLoginPage } from 'page-objects/regulator/login.page.js'
import { UploadSummaryLogPage } from 'page-objects/upload.summary.log.page.js'
import { WasteBalanceLedgerPage } from 'page-objects/waste.balance.ledger.page.js'
import { DashboardPage } from '../page-objects/dashboard.page.js'
import { WasteRecordsPage } from '../page-objects/waste.records.page.js'
import {
  createLinkedOrganisation,
  updateMigratedOrganisation
} from '../support/seeding/organisation.js'
import { externalAPIAcceptPrn } from '../support/seeding/prns.js'
import { checkBodyText } from '../support/checks.js'
import { todayddMMMyyyy } from '../support/date.js'
import { createPrnDetails } from '../support/fixtures.js'
import { PrnHelper } from '../support/prn.helper.js'
import { switchToNewTabAndClosePreviousTab } from '../support/windowtabs.js'
import { createLinkAndLogin } from '../support/login-helper.js'

test.describe('Issuing Packing Recycling Notes', () => {
  test('Should be able to create, issue and accept PRNs for Plastic (Reprocessor Output) @issuePRNOutput @smoketest', async ({
    page
  }) => {
    // Reassigned after each switchToNewTabAndClosePreviousTab call, since
    // that closes the tab `page` currently points at - every page object
    // constructed after a reassignment must be bound to the new value.
    let currentPage = page

    const createPRNPage = new CreatePRNPage(currentPage)
    const prnCreatedPage = new PRNCreatedPage(currentPage)
    let prnDashboardPage = new PRNDashboardPage(currentPage)
    const dashboardPage = new DashboardPage(currentPage)
    const wasteRecordsPage = new WasteRecordsPage(currentPage)

    const regNumber = 'R26ER5000000001PL'
    const accNumber = 'A26ER5000000001PL'

    const organisationDetails = await createLinkedOrganisation([
      { material: 'Plastic (R3)', wasteProcessingType: 'Reprocessor' }
    ])

    const migrationResponse = await updateMigratedOrganisation(
      organisationDetails.refNo,
      [
        {
          reprocessingType: 'output',
          regNumber,
          accNumber,
          status: 'approved'
        }
      ],
      'nrw'
    )

    await createLinkAndLogin(
      currentPage,
      organisationDetails.refNo,
      migrationResponse.email
    )

    // Tonnage value expected from Summary Log files upload
    // Plastic 56,455.67
    await dashboardPage.selectTableLink(1, 1)

    await wasteRecordsPage.submitSummaryLogLink().click()

    const filePath = `resources/sanity/reprocessorOutput_${accNumber}_${regNumber}.xlsx`
    const uploadSummaryLogPage = new UploadSummaryLogPage(currentPage)
    await uploadSummaryLogPage.performUploadAndReturnToHomepage(filePath)

    await dashboardPage.selectTableLink(1, 1)

    await wasteRecordsPage.createNewPRNLink().click()

    const originalWasteBalance = '56,455.67'
    const wasteBalanceHint = await createPRNPage.wasteBalanceHint()
    expect(wasteBalanceHint).toBe(
      `Your waste balance available for creating PRNs is ${originalWasteBalance} tonnes.`
    )

    let prnHelper = new PrnHelper(currentPage)

    const prnDetails = createPrnDetails({ accNumber, organisationDetails })

    await prnHelper.createAndCheckPrnDetails(prnDetails)

    await checkBodyText(
      currentPage,
      'Your available waste balance has been updated.',
      10
    )
    await checkBodyText(
      currentPage,
      'You can now issue this PRN through your PRNs page.',
      10
    )

    await prnCreatedPage.returnToRegistrationPage().click()
    await dashboardPage.selectTableLink(1, 1)
    await wasteRecordsPage.managePRNsLink().click()

    // Issue the created PRN
    await prnDashboardPage.selectAwaitingLink(1)
    await prnHelper.issuePrnAndUpdateDetails(prnDetails, 'WR', {
      checkDoubleClick: true
    })

    const prnIssuedPage = new PRNIssuedPage(currentPage)
    await prnIssuedPage.viewPdfButton().click()
    currentPage = await switchToNewTabAndClosePreviousTab(currentPage)

    prnHelper = new PrnHelper(currentPage)
    prnDashboardPage = new PRNDashboardPage(currentPage)
    const prnViewPage = new PRNViewPage(currentPage)

    await prnHelper.checkViewPrnDetails(prnDetails)
    await prnViewPage.returnToPRNList().click()

    await prnDashboardPage.backLink().click()

    // RPD accepts the PRN
    await externalAPIAcceptPrn(prnDetails)

    const wasteRecordsPageOnNewTab = new WasteRecordsPage(currentPage)
    await wasteRecordsPageOnNewTab.managePRNsLink().click()

    await prnDashboardPage.issuedTab().click()
    await prnHelper.checkIssuedRows(prnDetails, 1)

    await prnDashboardPage.selectIssuedLink(1)
    currentPage = await switchToNewTabAndClosePreviousTab(currentPage)

    prnHelper = new PrnHelper(currentPage)
    await prnHelper.checkViewPrnDetails(prnDetails)

    const homePageOnFinalTab = new HomePage(currentPage)
    await homePageOnFinalTab.signOutLink().click()
    await expect(currentPage).toHaveTitle(/Signed out/)

    // A regulator holds no PRN id of their own to build a path from, so they
    // reach the same PRN by two routes: the balance it moved on the
    // accreditation, and the PRN dashboard filed beneath that accreditation.
    const regulatorLoginPage = new RegulatorLoginPage(currentPage)
    const regulatorHomePage = new RegulatorHomePage(currentPage)
    const regulatorDashboardPage = new DashboardPage(currentPage)
    const registrationDetailsPage = new RegistrationDetailsPage(currentPage)
    const accreditationDetailsPage = new AccreditationDetailsPage(currentPage)
    const ledgerPage = new WasteBalanceLedgerPage(currentPage)
    const regulatorPrnViewPage = new PRNViewPage(currentPage)

    await regulatorLoginPage.loginAsRegulator()

    await regulatorHomePage.searchFor(
      organisationDetails.organisation.companyName
    )
    await regulatorHomePage.actionLink(1).click()

    expect(await regulatorDashboardPage.dashboardHeaderText()).toContain(
      organisationDetails.organisation.companyName
    )

    await regulatorDashboardPage.selectLink(1)

    // A regulator holds no ids to build a path from, so the accreditation's
    // own URL is kept here and used below to reach its PRN list directly,
    // the same way an operator would from a link this page does not offer.
    const accreditationUrl = new URL(
      (await registrationDetailsPage.actionLink(1).getAttribute('href')) ?? '',
      currentPage.url()
    ).toString()

    await registrationDetailsPage.actionLink(1).click()

    const accreditationSummary = await accreditationDetailsPage.summary()

    // The accepted PRN's tonnage was drawn from the original balance the
    // instant it was created, so what the regulator sees here is the balance
    // an operator never gets back to 56,455.67 - it stays down by the 203
    // tonnes prnDetails.tonnageWordings.integer committed.
    expect(accreditationSummary['Waste balance available (tonnes)']).toBe(
      '56,252.67'
    )

    // A regulator's screens hold no PRN action of their own - no create, issue,
    // or accept control renders for them, on either the registration or the
    // accreditation that carries the balance.
    expect(await registrationDetailsPage.changeControlCount()).toBe(0)
    expect(await accreditationDetailsPage.changeControlCount()).toBe(0)

    // The waste balance ledger is the accreditation's own record of the PRN's
    // whole life. It shares the accreditation page above rather than a route
    // of its own, so no navigation is needed to reach it.
    await expect(ledgerPage.heading()).toBeVisible()

    const ledgerEvents = await ledgerPage.eventRows()

    expect([...ledgerEvents[0].keys()]).toEqual([
      'Date',
      'Event',
      'Tonnage',
      'Waste balance available (tonnes)',
      'Who',
      'Actions'
    ])

    // Every movement this journey made, newest first: the summary log opened
    // the balance, the one PRN drew against it, and then moved through issue
    // and acceptance without drawing again. The note is given its number when
    // it is issued, and the ledger states the number against every movement
    // it caused - so the drawn row carries it too, the same as the two rows
    // above it.
    expect(ledgerEvents.map((event) => event.get('Event'))).toEqual([
      `PRN accepted\n${prnDetails.prnNumber}`,
      `PRN issued\n${prnDetails.prnNumber}`,
      `PRN created\n${prnDetails.prnNumber}`,
      'Summary log submitted'
    ])

    // Drawing the note took its tonnage out of the balance the summary log
    // put there; issuing and accepting settle an amount already held back, so
    // neither moves the balance a regulator is reading.
    expect(ledgerEvents.map((event) => event.get('Tonnage'))).toEqual([
      'N/A',
      'N/A',
      `-${prnDetails.tonnageWordings.integer}.00`,
      `+${originalWasteBalance}`
    ])

    // Every PRN row leads to the same note, because there is only one; the
    // summary log leads to its own file. The ids are the journey's to discover
    // rather than to know in advance, so they are matched by shape.
    const noteRoutePattern = new RegExp(
      `^${new URL(accreditationUrl).pathname}/packaging-recycling-notes/[0-9a-f]{24}/view$`
    )

    const actionTargets = await ledgerPage.actionTargets()

    expect(actionTargets.slice(0, 3)).toEqual([
      actionTargets[0],
      actionTargets[0],
      actionTargets[0]
    ])
    expect(actionTargets[0]).toMatch(noteRoutePattern)
    expect(actionTargets[3]).toMatch(
      /\/registrations\/[^/]+\/summary-logs\/files\/[^/]+\/download$/
    )

    // Reading a movement and then reading the note behind it is what the
    // ledger is for, so it is walked rather than asserted from the href
    // alone. The acceptance is the newest movement, so its row is the first.
    await ledgerPage.viewNoteLinks(prnDetails.prnNumber).first().click()

    await checkBodyText(currentPage, prnDetails.prnNumber, 10)

    // A regulator reads the note and is offered nothing to change on it, the
    // same claim the two change-control counts above make for the pages
    // either side of it.
    expect(await regulatorPrnViewPage.formCount()).toBe(0)

    // The PRN list is the other route to the same note, filed beneath the
    // accreditation rather than reached from the ledger. PAE-1930 forks that
    // address: an operator keeps their own dashboard and a regulator gets a
    // read-only page of their own, so this half asserts the regulator's.
    await currentPage.goto(`${accreditationUrl}/packaging-recycling-notes`)

    const regulatorPrnsPage = new PrnsDetailedViewPage(currentPage)

    await expect(regulatorPrnsPage.detailedView()).toBeVisible()

    await regulatorPrnsPage.selectTab('Issued')

    // The regulator's issued table heads its first column "Number" rather
    // than the operator's "PRN number", and formats the tonnage, so the row
    // is read here rather than through the operator's PrnHelper.
    const issued = (await regulatorPrnsPage.rows('issued'))[0]

    expect(issued.get('Number')).toEqual(prnDetails.prnNumber)
    expect(issued.get('Producer or compliance scheme')).toEqual(
      prnDetails.tradingName
    )
    // The regulator's pages abbreviate the month where the operator's spell it
    // out, so the same day reads differently either side of the fork.
    expect(issued.get('Date issued')).toEqual(todayddMMMyyyy)
    expect(issued.get('Tonnage')).toEqual(
      Number(prnDetails.tonnageWordings.integer).toFixed(2)
    )
    expect(issued.get('Status')).toEqual(prnDetails.status)

    await regulatorPrnsPage.actionLink('issued', 1).click()

    expect(await regulatorPrnViewPage.formCount()).toBe(0)
  })
})
