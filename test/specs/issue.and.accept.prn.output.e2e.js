import { test, expect } from '@playwright/test'
import { CreatePRNPage } from 'page-objects/create.prn.page.js'
import { HomePage } from 'page-objects/homepage.js'
import { PRNCreatedPage } from 'page-objects/prn.created.page.js'
import { PRNDashboardPage } from 'page-objects/prn.dashboard.page.js'
import { PRNIssuedPage } from 'page-objects/prn.issued.page.js'
import { PRNViewPage } from 'page-objects/prn.view.page.js'
import { AccreditationDetailsPage } from 'page-objects/regulator/accreditation.details.page.js'
import { RegistrationDetailsPage } from 'page-objects/regulator/registration.details.page.js'
import { RegulatorHomePage } from 'page-objects/regulator/home.page.js'
import { RegulatorLoginPage } from 'page-objects/regulator/login.page.js'
import { WasteBalanceLedgerPage } from 'page-objects/waste.balance.ledger.page.js'
import { DashboardPage } from '../page-objects/dashboard.page.js'
import { WasteRecordsPage } from '../page-objects/waste.records.page.js'
import {
  createLinkedOrganisation,
  updateMigratedOrganisation
} from '../support/seeding/organisation.js'
import { externalAPIAcceptPrn } from '../support/seeding/prns.js'
import { submitSummaryLogContent } from '../support/seeding/summary-logs.js'
import { generateSummaryLogContent } from '../support/spreadsheet/summarylogs-content-generator.js'
import { checkBodyText } from '../support/checks.js'
import { createPrnDetails } from '../support/fixtures.js'
import { PrnHelper } from '../support/prn.helper.js'
import { switchToNewTabAndClosePreviousTab } from '../support/windowtabs.js'
import { createLinkAndLogin } from '../support/login-helper.js'
import { defraIdStub } from '../support/defra-id-stub.js'

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

    const user = await createLinkAndLogin(
      currentPage,
      organisationDetails.refNo,
      migrationResponse.email
    )

    // Submitted via epr-backend's dev endpoint rather than driving the
    // upload UI: this journey is about PRN issuance, not the upload itself,
    // which the dedicated summary-log specs already cover.
    const summaryLogContent = await generateSummaryLogContent({
      wasteProcessingType: 'reprocessorOutput',
      materialSuffix: 'PL',
      regNumber,
      accNumber,
      rows: {
        'Reprocessed (sections 3 and 4)': [
          {
            rowId: 9001,
            fields: {
              PRODUCT_TONNAGE: 1000,
              UK_PACKAGING_WEIGHT_PERCENTAGE: 1,
              PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION: 1000,
              ADD_PRODUCT_WEIGHT: 'Yes'
            }
          }
        ]
      }
    })
    await submitSummaryLogContent(
      organisationDetails.refNo,
      migrationResponse.registrationIds[0],
      defraIdStub.authHeader(user.userId),
      summaryLogContent
    )

    await dashboardPage.selectTableLink(1, 1)

    await wasteRecordsPage.createNewPRNLink().click()

    const originalWasteBalance = '1,000.00'
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
    // reach the same PRN by two routes: the accreditation's waste balance
    // ledger, and the PRN dashboard filed beneath that accreditation.
    const regulatorLoginPage = new RegulatorLoginPage(currentPage)
    const regulatorHomePage = new RegulatorHomePage(currentPage)
    const regulatorDashboardPage = new DashboardPage(currentPage)
    const registrationDetailsPage = new RegistrationDetailsPage(currentPage)
    const accreditationDetailsPage = new AccreditationDetailsPage(currentPage)
    const ledgerPage = new WasteBalanceLedgerPage(currentPage)
    const regulatorPrnDashboardPage = new PRNDashboardPage(currentPage)
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
    // an operator never gets back to originalWasteBalance - it stays down by
    // the 203 tonnes prnDetails.tonnageWordings.integer committed.
    expect(accreditationSummary['Waste balance available (tonnes)']).toBe(
      '797.00'
    )

    // A regulator's screens hold no PRN action of their own - no create, issue,
    // or accept control renders for them, on either the registration or the
    // accreditation that carries the balance.
    expect(await registrationDetailsPage.changeControlCount()).toBe(0)
    expect(await accreditationDetailsPage.changeControlCount()).toBe(0)

    // The waste balance ledger is the accreditation's own record of the PRN's
    // whole life. The accreditation page above shows its most recent events
    // only, so the whole record is read on the page behind that section's link.
    await accreditationDetailsPage.ledgerDetailedViewLink().click()

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
    // summary log leads to its own file.
    const actionTargets = await ledgerPage.actionTargets()

    expect(actionTargets.slice(0, 3)).toEqual([
      actionTargets[0],
      actionTargets[0],
      actionTargets[0]
    ])
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

    // The PRN dashboard is the other route to the same note, filed beneath
    // the accreditation rather than reached from the ledger. It is where an
    // operator manages their PRNs, and a regulator is given the same list
    // with nothing on it to manage.
    await currentPage.goto(`${accreditationUrl}/packaging-recycling-notes`)

    await regulatorPrnDashboardPage.issuedTab().click()
    await prnHelper.checkIssuedRows(prnDetails, 1)

    await regulatorPrnDashboardPage.selectIssuedLink(1)

    expect(await regulatorPrnViewPage.formCount()).toBe(0)
  })
})
