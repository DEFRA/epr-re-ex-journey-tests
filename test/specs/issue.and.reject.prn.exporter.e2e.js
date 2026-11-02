import { test, expect } from '@playwright/test'
import { CheckBeforeCreatingPRNPage } from 'page-objects/check.before.creating.prn.page.js'
import { ConfirmCancelPRNPage } from 'page-objects/confirm.cancel.prn.page.js'
import { ConfirmDeletePRNPage } from 'page-objects/confirm.delete.prn.page.js'
import { ConfirmDiscardPRNPage } from 'page-objects/confirm.discard.prn.page.js'
import { CreatePRNPage } from 'page-objects/create.prn.page.js'
import { HomePage } from 'page-objects/homepage.js'
import { PRNCancelledPage } from 'page-objects/prn.cancelled.page.js'
import { PRNCreatedPage } from 'page-objects/prn.created.page.js'
import { PRNDashboardPage } from 'page-objects/prn.dashboard.page.js'
import { PRNIssuedPage } from 'page-objects/prn.issued.page.js'
import { PRNViewPage } from 'page-objects/prn.view.page.js'
import { DashboardPage } from '../page-objects/dashboard.page.js'
import { WasteRecordsPage } from '../page-objects/waste.records.page.js'
import {
  seedOverseasSites,
  createLinkedOrganisation,
  updateMigratedOrganisation
} from '../support/seeding/organisation.js'
import { externalAPICancelPrn } from '../support/seeding/prns.js'
import {
  registrationStartYear,
  submitSummaryLogContent
} from '../support/seeding/summary-logs.js'
import { generateSummaryLogContent } from '../support/spreadsheet/summarylogs-content-generator.js'
import { checkAccessibility } from '../support/accessibility.js'
import { checkBodyText } from '../support/checks.js'
import {
  tradingName,
  secondTradingName as newTradingName,
  thirdTradingName as updatedTradingName,
  createPrnDetails
} from '../support/fixtures.js'
import { PrnHelper } from '../support/prn.helper.js'
import { switchToNewTabAndClosePreviousTab } from '../support/windowtabs.js'
import { createLinkAndLogin } from '../support/login-helper.js'
import { checkWasteBalanceForWindow } from '../support/waste-balance-mode.js'
import { defraIdStub } from '../support/defra-id-stub.js'
import { generateNumbers } from '../support/reg-acc-number.js'

// The exporter discards two drafts, creates and deletes a PERN, then takes
// three more through issue and cancellation: longer than the suite's
// two-minute default allows.
const JOURNEY_TIMEOUT_MS = 4 * 60 * 1000

test.describe('Issuing Packing Recycling Notes (Exporter)', () => {
  test('Should be able to discard, delete, create, issue and reject PRNs for Wood (Exporter) @issuePRNExp @prnExporter @delPRNExp @smoketest', async ({
    page
  }) => {
    test.setTimeout(JOURNEY_TIMEOUT_MS)

    // switchToNewTabAndClosePreviousTab() closes the page it's given and
    // returns the newly opened tab as the one to keep using — every page
    // object built against the old `page` reference goes stale once that
    // happens. `currentPage` tracks whichever tab is live, and
    // rebindPageObjects() re-instantiates every page object against it;
    // called once up front and again after each tab switch below.
    let currentPage = page

    let prnHelper,
      homePage,
      dashboardPage,
      wasteRecordsPage,
      createPRNPage,
      checkBeforeCreatingPrnPage,
      confirmDiscardPRNPage,
      confirmDeletePRNPage,
      prnCreatedPage,
      prnDashboardPage,
      prnViewPage,
      prnIssuedPage,
      confirmCancelPrnPage,
      prnCancelledPage

    const rebindPageObjects = () => {
      prnHelper = new PrnHelper(currentPage, true)
      homePage = new HomePage(currentPage)
      dashboardPage = new DashboardPage(currentPage)
      wasteRecordsPage = new WasteRecordsPage(currentPage)
      createPRNPage = new CreatePRNPage(currentPage)
      checkBeforeCreatingPrnPage = new CheckBeforeCreatingPRNPage(currentPage)
      confirmDiscardPRNPage = new ConfirmDiscardPRNPage(currentPage)
      confirmDeletePRNPage = new ConfirmDeletePRNPage(currentPage)
      prnCreatedPage = new PRNCreatedPage(currentPage)
      prnDashboardPage = new PRNDashboardPage(currentPage)
      prnViewPage = new PRNViewPage(currentPage)
      prnIssuedPage = new PRNIssuedPage(currentPage)
      confirmCancelPrnPage = new ConfirmCancelPRNPage(currentPage)
      prnCancelledPage = new PRNCancelledPage(currentPage)
    }
    rebindPageObjects()

    const { regNumber, accNumber } = generateNumbers({
      wasteProcessingType: 'exporter',
      materialSuffix: 'WO'
    })

    const materialDesc = 'Wood'

    const organisationDetails = await createLinkedOrganisation([
      { material: 'Wood (R3)', wasteProcessingType: 'Exporter' }
    ])

    const migrationResponse = await updateMigratedOrganisation(
      organisationDetails.refNo,
      [
        {
          regNumber,
          accNumber,
          status: 'approved'
        }
      ]
    )

    await seedOverseasSites(organisationDetails.refNo)

    const user = await createLinkAndLogin(
      currentPage,
      organisationDetails.refNo,
      migrationResponse.email
    )

    // Submitted via epr-backend's dev endpoint rather than driving the
    // upload UI: this journey is about PERN issuance, not the upload itself,
    // which the dedicated summary-log specs already cover.
    const expectedWasteBalance = '797.00'
    const originalWasteBalance = '1,000.00'

    const summaryLogContent = await generateSummaryLogContent({
      wasteProcessingType: 'exporter',
      materialSuffix: 'WO',
      regNumber,
      accNumber,
      rows: {
        'Exported (sections 1, 2 and 3)': [
          {
            rowId: 9001,
            fields: {
              WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE: 'No',
              DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE: 'No',
              WAS_THE_WASTE_REFUSED: 'No',
              WAS_THE_WASTE_STOPPED: 'No',
              OSR_ID: 100,
              TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 1000
            }
          }
        ]
      }
    })
    await submitSummaryLogContent(
      organisationDetails.refNo,
      migrationResponse.registrationIds[0],
      defraIdStub.authHeader(user.userId),
      summaryLogContent,
      registrationStartYear()
    )

    await checkAccessibility(currentPage, 'Dashboard')

    await dashboardPage.selectTableLink(1, 1)
    await checkAccessibility(currentPage, 'Waste records (accredited)')

    expect(await wasteRecordsPage.wasteBalanceAmount()).toBe(
      originalWasteBalance
    )

    await wasteRecordsPage.createNewPERNLink().click()
    await checkAccessibility(currentPage, 'Create PERN')

    const ordinaryPool = await checkWasteBalanceForWindow(
      createPRNPage,
      organisationDetails.refNo,
      migrationResponse.registrationIds[0],
      migrationResponse.accreditationIds[0],
      originalWasteBalance,
      'PERNs'
    )

    // --- Discard two drafts ---
    // Empty issuer notes, so the PERN draft says "Not provided"
    const discardedPernDetails = createPrnDetails({
      tradingName: newTradingName,
      issuerNotes: '',
      materialDesc,
      accNumber,
      organisationDetails,
      wasteBalancePool: ordinaryPool
    })
    await prnHelper.createAndCheckDraftPrn(discardedPernDetails)

    // Discard the first attempt (double-click prevented)
    await checkBeforeCreatingPrnPage.discardAndStartAgainLink().click()
    expect(await confirmDiscardPRNPage.headingText()).toBe(
      'Are you sure you want to discard this PERN?'
    )
    await confirmDiscardPRNPage.discardAndCheckDoubleClickPrevented()

    // Second attempt, this time with notes
    discardedPernDetails.issuerNotes = 'Testing'
    await prnHelper.createAndCheckDraftPrn(discardedPernDetails)

    // The discard page's back link returns to the check page, then discard
    await checkBeforeCreatingPrnPage.discardAndStartAgainLink().click()
    await confirmDiscardPRNPage.backLink().click()
    await checkBeforeCreatingPrnPage.discardAndStartAgainLink().click()
    await confirmDiscardPRNPage.discardAndCheckDoubleClickPrevented()

    // --- Create page validation ---
    expect(await createPRNPage.headingText()).toBe('Enter PERN details')
    expect(await createPRNPage.captionText()).toBe('Create PERN')
    expect(await createPRNPage.materialDetails()).toBe(
      `Material: ${materialDesc}`
    )

    // An exporter sees no December waste controls outside the declaration
    // window - CI keeps the window closed for this pass (see
    // run-journey-tests' december-scope split), so this pins their absence
    // rather than assuming it.
    expect(await createPRNPage.decemberWasteVisible()).toBe(false)

    await createPRNPage.submitAndCheckDoubleClickPrevented()
    expect(await createPRNPage.errorMessages(2)).toEqual([
      'Enter PERN tonnage as a whole number',
      'Enter a packaging producer or compliance scheme'
    ])

    // An over-balance tonnage is refused at the create step itself: the create
    // page re-renders with the balance error rather than the draft being
    // created.
    await createPRNPage.createPrn(
      9999999,
      tradingName,
      'Testing',
      undefined,
      ordinaryPool
    )
    expect(await createPRNPage.errorMessages(1)).toEqual([
      'The tonnage you entered exceeds your available waste balance'
    ])

    // --- Create a PERN, then delete it ---
    const deletedPernDetails = createPrnDetails({
      issuerNotes: 'Testing',
      materialDesc,
      accNumber,
      organisationDetails,
      wasteBalancePool: ordinaryPool
    })
    await prnHelper.createAndCheckPrnDetails(deletedPernDetails)

    await prnCreatedPage.returnToRegistrationPage().click()
    await dashboardPage.selectTableLink(1, 1)

    // The waste balance is deducted on creation
    expect(await wasteRecordsPage.wasteBalanceAmount()).toBe(
      expectedWasteBalance
    )

    await wasteRecordsPage.managePERNsLink().click()

    await prnDashboardPage.issuedTab().click()
    expect(await prnDashboardPage.getNoIssuedPrnMessage()).toBe(
      'No PERNs have been issued yet.'
    )

    await prnDashboardPage.awaitingActionTab().click()
    await prnDashboardPage.selectAwaitingLink(1)

    // The back link on the delete confirmation page first
    await prnViewPage.deletePRNButton().click()
    expect(await confirmDeletePRNPage.headingText()).toBe(
      'Are you sure you want to delete this PERN?'
    )
    await checkAccessibility(currentPage, 'Confirm delete PERN')
    await confirmDeletePRNPage.backLink().click()

    await prnViewPage.deletePRNButton().click()
    expect(await confirmDeletePRNPage.headingText()).toBe(
      'Are you sure you want to delete this PERN?'
    )
    await confirmDeletePRNPage.deletePrnAndCheckDoubleClickPrevented('PERN')

    expect(await prnDashboardPage.getNoCreatedPrnMessage()).toBe(
      'You have not created any PERNs.'
    )

    await prnDashboardPage.backLink().click()

    // The deleted PERN's tonnage is returned to the balance
    expect(await wasteRecordsPage.wasteBalanceAmount()).toBe(
      originalWasteBalance
    )

    // --- Create, issue and reject PERNs ---
    await wasteRecordsPage.createNewPERNLink().click()

    const pernDetails = createPrnDetails({
      materialDesc,
      accNumber,
      organisationDetails,
      wasteBalancePool: ordinaryPool
    })

    await prnHelper.createAndCheckDraftPrn(pernDetails)
    await checkAccessibility(currentPage, 'Check before creating PERN')
    await prnHelper.confirmDraftPrn(pernDetails)
    await checkAccessibility(currentPage, 'PERN created')

    await checkBodyText(
      currentPage,
      'Your available waste balance has been updated.',
      10
    )
    await checkBodyText(
      currentPage,
      'You can now issue this PERN through your PERNs page.',
      10
    )

    await prnHelper.returnHomeFromCreatedPage()
    await dashboardPage.selectTableLink(1, 1)
    await wasteRecordsPage.managePERNsLink().click()

    // PRN Dashboard checks - Waste Balance Amount, Awaiting Authorisation table values
    let wasteBalanceAmount = await prnDashboardPage.wasteBalanceAmount()
    expect(wasteBalanceAmount).toBe(expectedWasteBalance)

    // Check cancel hint text
    const cancelHintText = await prnDashboardPage.cancelHintText()
    expect(cancelHintText).toBe(
      'If you delete or cancel a PERN, its tonnage will be added to your available waste balance.'
    )
    const selectPERNHeadingText = await prnDashboardPage.selectPrnHeadingText()
    expect(selectPERNHeadingText).toBe('Select a PERN')

    await prnHelper.checkAwaitingRows(pernDetails, 1)
    await checkAccessibility(
      currentPage,
      'PERN dashboard (awaiting authorisation)'
    )
    // End of PRN Dashboard checks

    await prnDashboardPage.selectAwaitingLink(1)
    await prnHelper.checkViewPrnDetails(pernDetails)
    await checkAccessibility(currentPage, 'PERN view (awaiting authorisation)')
    await prnViewPage.returnToPERNList().click()

    // Issue the created PERN
    await prnDashboardPage.selectAwaitingLink(1)
    await prnHelper.issuePrnAndUpdateDetails(pernDetails, 'EX')
    await checkAccessibility(currentPage, 'PERN issued')

    await prnIssuedPage.viewPdfButton().click()
    currentPage = await switchToNewTabAndClosePreviousTab(currentPage)
    rebindPageObjects()

    await prnHelper.checkViewPrnDetails(pernDetails)

    await prnViewPage.returnToPERNList().click()

    const noPrnMessage = await prnDashboardPage.getNoPrnMessage()
    expect(noPrnMessage).toBe('No PRNs or PERNs have been created yet.')

    await prnDashboardPage.backLink().click()

    wasteBalanceAmount = await wasteRecordsPage.wasteBalanceAmount()
    expect(wasteBalanceAmount).toBe(expectedWasteBalance)

    // Create a new PERN
    await wasteRecordsPage.createNewPERNLink().click()

    const newTonnageWordings = {
      integer: 19,
      word: 'Nineteen'
    }
    const newIssuerNotes = 'Testing another PERN'

    const newPernDetails = createPrnDetails({
      tonnageWordings: newTonnageWordings,
      tradingName: newTradingName,
      issuerNotes: newIssuerNotes,
      materialDesc,
      accNumber,
      organisationDetails,
      wasteBalancePool: ordinaryPool
    })

    await prnHelper.createAndCheckPrnDetails(newPernDetails)
    // End of new PERN creation

    await prnHelper.returnHomeFromCreatedPage()
    await dashboardPage.selectTableLink(1, 1)

    await wasteRecordsPage.managePERNsLink().click()

    await prnHelper.checkAwaitingRows(newPernDetails, 1)

    await prnDashboardPage.selectAwaitingLink(1)

    await prnHelper.checkViewPrnDetails(newPernDetails)

    await prnHelper.issuePrnAndUpdateDetails(newPernDetails, 'EX')
    await prnHelper.checkIssuedPageLinks()

    await prnHelper.returnHomeFromIssuedPage()
    await wasteRecordsPage.managePERNsLink().click()

    // Check issued PERNs
    await prnDashboardPage.issuedTab().click()
    await prnHelper.checkIssuedRows(pernDetails, 1)
    await prnHelper.checkIssuedRows(newPernDetails, 2)

    // Check first Issued PRN details
    await prnDashboardPage.selectIssuedLink(1)
    currentPage = await switchToNewTabAndClosePreviousTab(currentPage)
    rebindPageObjects()

    // Check Issued PERN details
    await prnHelper.checkViewPrnDetails(pernDetails)

    // Now RPD cancels the PERN
    await externalAPICancelPrn(pernDetails)

    await prnViewPage.returnToPERNList().click()

    // See that on the PRN Dashboard page, only PERNs awaiting cancellation are shown
    const tableHeading = await prnDashboardPage.getTableHeading()
    expect(tableHeading).toBe('PERNs awaiting cancellation')
    await prnHelper.checkAwaitingRows(pernDetails, 1)
    await checkAccessibility(
      currentPage,
      'PERN dashboard (awaiting cancellation)'
    )

    // The dashboard's own button reaches the create PERN page
    await prnDashboardPage.createAPrnButton().click()
    expect(await createPRNPage.headingText()).toBe('Enter PERN details')
    expect(await createPRNPage.materialDetails()).toBe(
      `Material: ${materialDesc}`
    )

    // Create another new PERN
    const updatedTonnageWordings = {
      integer: 15,
      word: 'Fifteen'
    }

    const updatedPernDetails = createPrnDetails({
      tonnageWordings: updatedTonnageWordings,
      tradingName: updatedTradingName,
      issuerNotes: newIssuerNotes,
      materialDesc,
      accNumber,
      organisationDetails,
      wasteBalancePool: ordinaryPool
    })

    await prnHelper.createAndCheckPrnDetails(updatedPernDetails)
    // End of new PERN creation

    await prnCreatedPage.pernsPageLink().click()

    // See that on the PRN Dashboard page, PERNs awaiting authorisation and cancellation are shown
    const awaitingAuthHeading = await prnDashboardPage.getTableHeading()
    expect(awaitingAuthHeading).toBe('PERNs awaiting authorisation')

    await prnHelper.checkAwaitingRows(updatedPernDetails, 1)

    const awaitingCancellationHeading =
      await prnDashboardPage.getTableHeading(2)
    expect(awaitingCancellationHeading).toBe('PERNs awaiting cancellation')
    await prnHelper.checkAwaitingRows(pernDetails, 1, 2)

    // Select awaiting cancellation PRN
    await prnDashboardPage.selectAwaitingLink(1, 2)

    await prnHelper.checkViewPrnDetails(pernDetails)
    await checkAccessibility(currentPage, 'PERN view (awaiting cancellation)')

    // Test back link of cancellation page
    await prnViewPage.cancelPRNButton().click()

    const confirmCancelHeading = await confirmCancelPrnPage.headingText()
    expect(confirmCancelHeading).toBe('Confirm cancellation of this PERN')
    await checkAccessibility(currentPage, 'Confirm cancel PERN')
    await confirmCancelPrnPage.backLink().click()

    // Now cancel the PERN and return to PRN Dashboard page
    await prnHelper.cancelPRN(pernDetails, { checkDoubleClick: true })
    await checkAccessibility(currentPage, 'PERN cancelled')
    await prnCancelledPage.pernsPage().click()

    await prnDashboardPage.cancelledTab().click()
    await prnHelper.checkCancelledRows(pernDetails, 1)
    await prnDashboardPage.selectCancelledLink(1)
    currentPage = await switchToNewTabAndClosePreviousTab(currentPage)
    rebindPageObjects()

    await prnHelper.checkViewPrnDetails(pernDetails)
    await prnViewPage.returnToPERNList().click()
    // End of PERN cancellation test

    await prnDashboardPage.backLink().click()
    await wasteRecordsPage.backLink().click()

    // Check that the waste balance has been updated from the cancelled PRN
    const expectedUpdatedWasteBalance = '966.00'
    const availableWasteBalance = await dashboardPage.availableWasteBalance(1)
    expect(availableWasteBalance).toBe(expectedUpdatedWasteBalance)

    await homePage.signOutLink().click()
    await expect(currentPage).toHaveTitle(/Signed out/)
  })
})
