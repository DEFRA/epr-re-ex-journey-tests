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
  updateMigratedOrganisation
} from '../support/seeding/organisation.js'
import { externalAPICancelPrn } from '../support/seeding/prns.js'
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
  test('Should be able to create, issue and reject PRNs for Wood (Exporter) @issuePRNExp @smoketest', async ({
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

    const regNumber = 'R26EX5000000002WO'
    const accNumber = 'A26EX5000000002WO'

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

    await wasteRecordsPage.submitSummaryLogLink().click()

    const filePath = `resources/sanity/exporter_${accNumber}_${regNumber}.xlsx`
    const uploadSummaryLogPage = new UploadSummaryLogPage(currentPage)
    await uploadSummaryLogPage.performUploadAndReturnToHomepage(filePath)

    await dashboardPage.selectTableLink(1, 1)

    await wasteRecordsPage.createNewPERNLink().click()

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

    await prnCreatedPage.returnToRegistrationPage().click()
    await dashboardPage.selectTableLink(1, 1)
    await wasteRecordsPage.managePERNsLink().click()

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
    await prnViewPage.returnToPERNList().click()

    // Issue the created PERN
    await prnDashboardPage.selectAwaitingLink(1)
    await prnHelper.issuePrnAndUpdateDetails(pernDetails, 'EX')

    await prnIssuedPage.viewPdfButton().click()
    currentPage = await switchToNewTabAndClosePreviousTab(currentPage)
    prnHelper = new PrnHelper(currentPage, true)
    prnViewPage = new PRNViewPage(currentPage)
    prnDashboardPage = new PRNDashboardPage(currentPage)
    wasteRecordsPage = new WasteRecordsPage(currentPage)
    prnCreatedPage = new PRNCreatedPage(currentPage)
    dashboardPage = new DashboardPage(currentPage)
    prnIssuedPage = new PRNIssuedPage(currentPage)

    await prnHelper.checkViewPrnDetails(pernDetails)

    await prnViewPage.returnToPERNList().click()

    const noPrnMessage = await prnDashboardPage.getNoPrnMessage()
    expect(noPrnMessage).toBe('No PRNs or PERNs have been created yet.')

    await prnDashboardPage.backLink().click()

    wasteBalanceAmount = await wasteRecordsPage.wasteBalanceAmount()
    expect(wasteBalanceAmount).toBe(expectedWasteBalance + ' tonnes')

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
      organisationDetails
    })

    await prnHelper.createAndCheckPrnDetails(newPernDetails)
    // End of new PERN creation

    await prnCreatedPage.returnToRegistrationPage().click()
    await dashboardPage.selectTableLink(1, 1)

    await wasteRecordsPage.managePERNsLink().click()

    await prnHelper.checkAwaitingRows(newPernDetails, 1)

    await prnDashboardPage.selectAwaitingLink(1)

    await prnHelper.checkViewPrnDetails(newPernDetails)

    await prnHelper.issuePrnAndUpdateDetails(newPernDetails, 'EX')
    await prnHelper.checkIssuedPageLinks()

    await prnIssuedPage.returnToHomeLink().click()
    await wasteRecordsPage.managePERNsLink().click()

    // Check issued PERNs
    await prnDashboardPage.issuedTab().click()
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

    await prnViewPage.returnToPERNList().click()

    // See that on the PRN Dashboard page, only PERNs awaiting cancellation are shown
    const tableHeading = await prnDashboardPage.getTableHeading()
    expect(tableHeading).toBe('PERNs awaiting cancellation')
    await prnHelper.checkAwaitingRows(pernDetails, 1)

    await prnDashboardPage.backLink().click()

    // Create another new PERN
    await wasteRecordsPage.createNewPERNLink().click()

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

    // Test back link of cancellation page
    await prnViewPage.cancelPRNButton().click()

    const confirmCancelHeading = await confirmCancelPrnPage.headingText()
    expect(confirmCancelHeading).toBe('Confirm cancellation of this PERN')
    await confirmCancelPrnPage.backLink().click()

    // Now cancel the PRN and return to PRN Dashboard page
    await prnHelper.cancelPRNAndReturnToPRNsDashboard(pernDetails)

    await prnDashboardPage.cancelledTab().click()
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
    await prnViewPage.returnToPERNList().click()
    // End of PERN cancellation test

    await prnDashboardPage.backLink().click()
    await wasteRecordsPage.backLink().click()

    // Check that the waste balance has been updated from the cancelled PRN
    const expectedUpdatedWasteBalance = '1,494.09'
    const availableWasteBalance = await dashboardPage.availableWasteBalance(1)
    expect(availableWasteBalance).toBe(expectedUpdatedWasteBalance)

    await homePage.signOutLink().click()
    await expect(currentPage).toHaveTitle(/Signed out/)
  })
})
