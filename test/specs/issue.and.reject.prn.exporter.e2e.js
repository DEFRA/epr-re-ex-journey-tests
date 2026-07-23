import { test, expect } from '@playwright/test'
import { ConfirmCancelPRNPage } from 'page-objects/confirm.cancel.prn.page.js'
import { CreatePRNPage } from 'page-objects/create.prn.page.js'
import { HomePage } from 'page-objects/homepage.js'
import { PRNCreatedPage } from 'page-objects/prn.created.page.js'
import { PRNDashboardPage } from 'page-objects/prn.dashboard.page.js'
import { PRNIssuedPage } from 'page-objects/prn.issued.page.js'
import { PRNViewPage } from 'page-objects/prn.view.page.js'
import { UploadSummaryLogPage } from 'page-objects/upload.summary.log.page.js'
import { DashboardPage } from '../page-objects/dashboard.page.js'
import { WasteRecordsPage } from '../page-objects/waste.records.page.js'
import {
  seedOverseasSites,
  createLinkedOrganisation,
  externalAPICancelPrn,
  updateMigratedOrganisation
} from '../support/apicalls.js'
import { checkBodyText } from '../support/checks.js'
import {
  secondTradingName as newTradingName,
  thirdTradingName as updatedTradingName,
  createPrnDetails
} from '../support/fixtures.js'
import { PrnHelper } from '../support/prn.helper.js'
import { switchToNewTabAndClosePreviousTab } from '../support/windowtabs.js'
import { createLinkAndLogin } from '../support/login-helper.js'

test.describe('Issuing Packing Recycling Notes (Exporter)', () => {
  test('Should be able to create, issue and reject PRNs for Wood (Exporter) @issueprnexp @smoketest', async ({
    page
  }) => {
    let currentPage = page
    let homePage = new HomePage(currentPage)
    let confirmCancelPrnPage = new ConfirmCancelPRNPage(currentPage)
    const createPRNPage = new CreatePRNPage(currentPage)
    let prnCreatedPage = new PRNCreatedPage(currentPage)
    let prnDashboardPage = new PRNDashboardPage(currentPage)
    let prnIssuedPage = new PRNIssuedPage(currentPage)
    let prnViewPage = new PRNViewPage(currentPage)
    let dashboardPage = new DashboardPage(currentPage)
    let wasteRecordsPage = new WasteRecordsPage(currentPage)

    const regNumber = 'E25SR500020912WO'
    const accNumber = 'E-ACC12245WO'

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

    await createLinkAndLogin(
      currentPage,
      organisationDetails.refNo,
      migrationResponse.email
    )

    // Tonnage value expected from Summary Log files upload
    // Wood
    const expectedWasteBalance = '1,325.09'

    await dashboardPage.selectTableLink(1, 1)

    await wasteRecordsPage.submitSummaryLogLink()

    const filePath = `resources/sanity/exporter_${accNumber}_${regNumber}.xlsx`
    const uploadSummaryLogPage = new UploadSummaryLogPage(currentPage)
    await uploadSummaryLogPage.performUploadAndReturnToHomepage(filePath)

    await dashboardPage.selectTableLink(1, 1)

    await wasteRecordsPage.createNewPERNLink()

    const originalWasteBalance = '1,528.09'
    const wasteBalanceHint = await createPRNPage.wasteBalanceHint()
    expect(wasteBalanceHint).toBe(
      `Your waste balance available for creating PERNs is ${originalWasteBalance} tonnes.`
    )

    let prnHelper = new PrnHelper(currentPage, true)

    const pernDetails = createPrnDetails({
      materialDesc,
      accNumber,
      organisationDetails
    })

    await prnHelper.createAndCheckPrnDetails(pernDetails)

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

    await prnCreatedPage.returnToRegistrationPage()
    await dashboardPage.selectTableLink(1, 1)
    await wasteRecordsPage.managePERNsLink()

    // PRN Dashboard checks - Waste Balance Amount, Awaiting Authorisation table values
    let wasteBalanceAmount = await prnDashboardPage.wasteBalanceAmount()
    expect(wasteBalanceAmount).toBe(expectedWasteBalance + ' tonnes')

    // Check cancel hint text
    const cancelHintText = await prnDashboardPage.cancelHintText()
    expect(cancelHintText).toBe(
      'If you delete or cancel a PERN, its tonnage will be added to your available waste balance.'
    )
    const selectPERNHeadingText = await prnDashboardPage.selectPrnHeadingText()
    expect(selectPERNHeadingText).toBe('Select a PERN')

    await prnHelper.checkAwaitingRows(pernDetails, 1)
    // End of PRN Dashboard checks

    await prnDashboardPage.selectAwaitingLink(1)
    await prnHelper.checkViewPrnDetails(pernDetails)
    await prnViewPage.returnToPERNList()

    // Issue the created PERN
    await prnDashboardPage.selectAwaitingLink(1)
    await prnHelper.issuePrnAndUpdateDetails(pernDetails, 'EX')

    await prnIssuedPage.viewPdfButton()
    currentPage = await switchToNewTabAndClosePreviousTab(currentPage)
    prnHelper = new PrnHelper(currentPage, true)
    prnViewPage = new PRNViewPage(currentPage)
    prnDashboardPage = new PRNDashboardPage(currentPage)
    wasteRecordsPage = new WasteRecordsPage(currentPage)
    prnCreatedPage = new PRNCreatedPage(currentPage)
    dashboardPage = new DashboardPage(currentPage)
    prnIssuedPage = new PRNIssuedPage(currentPage)

    await prnHelper.checkViewPrnDetails(pernDetails)

    await prnViewPage.returnToPERNList()

    const noPrnMessage = await prnDashboardPage.getNoPrnMessage()
    expect(noPrnMessage).toBe('No PRNs or PERNs have been created yet.')

    await prnDashboardPage.selectBackLink()

    wasteBalanceAmount = await wasteRecordsPage.wasteBalanceAmount()
    expect(wasteBalanceAmount).toBe(expectedWasteBalance + ' tonnes')

    // Create a new PERN
    await wasteRecordsPage.createNewPERNLink()

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
      organisationDetails
    })

    await prnHelper.createAndCheckPrnDetails(newPernDetails)
    // End of new PERN creation

    await prnCreatedPage.returnToRegistrationPage()
    await dashboardPage.selectTableLink(1, 1)

    await wasteRecordsPage.managePERNsLink()

    await prnHelper.checkAwaitingRows(newPernDetails, 1)

    await prnDashboardPage.selectAwaitingLink(1)

    await prnHelper.checkViewPrnDetails(newPernDetails)

    await prnHelper.issuePrnAndUpdateDetails(newPernDetails, 'EX')
    await prnHelper.checkIssuedPageLinks()

    await prnIssuedPage.returnToHomePage()
    await wasteRecordsPage.managePERNsLink()

    // Check issued PERNs
    await prnDashboardPage.selectIssuedTab()
    await prnHelper.checkIssuedRows(pernDetails, 1)
    await prnHelper.checkIssuedRows(newPernDetails, 2)

    // Check first Issued PRN details
    await prnDashboardPage.selectIssuedLink(1)
    currentPage = await switchToNewTabAndClosePreviousTab(currentPage)
    prnHelper = new PrnHelper(currentPage, true)
    prnViewPage = new PRNViewPage(currentPage)
    prnDashboardPage = new PRNDashboardPage(currentPage)
    wasteRecordsPage = new WasteRecordsPage(currentPage)
    prnCreatedPage = new PRNCreatedPage(currentPage)
    dashboardPage = new DashboardPage(currentPage)
    prnIssuedPage = new PRNIssuedPage(currentPage)
    confirmCancelPrnPage = new ConfirmCancelPRNPage(currentPage)

    // Check Issued PERN details
    await prnHelper.checkViewPrnDetails(pernDetails)

    // Now RPD cancels the PERN
    await externalAPICancelPrn(pernDetails)

    await prnViewPage.returnToPERNList()

    // See that on the PRN Dashboard page, only PERNs awaiting cancellation are shown
    const tableHeading = await prnDashboardPage.getTableHeading()
    expect(tableHeading).toBe('PERNs awaiting cancellation')
    await prnHelper.checkAwaitingRows(pernDetails, 1)

    await prnDashboardPage.selectBackLink()

    // Create another new PERN
    await wasteRecordsPage.createNewPERNLink()

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
      organisationDetails
    })

    await prnHelper.createAndCheckPrnDetails(updatedPernDetails)
    // End of new PERN creation

    await prnCreatedPage.pernsPageLink()

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

    // Test back link of cancellation page
    await prnViewPage.cancelPRNButton()

    const confirmCancelHeading = await confirmCancelPrnPage.headingText()
    expect(confirmCancelHeading).toBe('Confirm cancellation of this PERN')
    await confirmCancelPrnPage.selectBackLink()

    // Now cancel the PRN and return to PRN Dashboard page
    await prnHelper.cancelPRNAndReturnToPRNsDashboard(pernDetails)

    await prnDashboardPage.selectCancelledTab()
    await prnHelper.checkCancelledRows(pernDetails, 1)
    await prnDashboardPage.selectCancelledLink(1)
    currentPage = await switchToNewTabAndClosePreviousTab(currentPage)
    prnHelper = new PrnHelper(currentPage, true)
    prnViewPage = new PRNViewPage(currentPage)
    prnDashboardPage = new PRNDashboardPage(currentPage)
    wasteRecordsPage = new WasteRecordsPage(currentPage)
    dashboardPage = new DashboardPage(currentPage)
    homePage = new HomePage(currentPage)

    await prnHelper.checkViewPrnDetails(pernDetails)
    await prnViewPage.returnToPERNList()
    // End of PERN cancellation test

    await prnDashboardPage.selectBackLink()
    await wasteRecordsPage.selectBackLink()

    // Check that the waste balance has been updated from the cancelled PRN
    const expectedUpdatedWasteBalance = '1,494.09'
    const availableWasteBalance = await dashboardPage.availableWasteBalance(1)
    expect(availableWasteBalance).toBe(expectedUpdatedWasteBalance)

    await homePage.signOut()
    await expect(currentPage).toHaveTitle(/Signed out/)
  })
})
