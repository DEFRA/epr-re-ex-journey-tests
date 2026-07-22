import { browser, expect } from '@wdio/globals'
import ConfirmCancelPrnPage from 'page-objects/confirm.cancel.prn.page.js'
import CreatePRNPage from 'page-objects/create.prn.page.js'
import HomePage from 'page-objects/homepage.js'
import PrnCreatedPage from 'page-objects/prn.created.page.js'
import PrnDashboardPage from 'page-objects/prn.dashboard.page.js'
import PrnIssuedPage from 'page-objects/prn.issued.page.js'
import PrnViewPage from 'page-objects/prn.view.page.js'
import DashboardPage from '../page-objects/dashboard.page.js'
import WasteRecordsPage from '../page-objects/waste.records.page.js'
import {
  seedOverseasSites,
  createLinkedOrganisation,
  externalAPICancelPrn,
  updateMigratedOrganisation,
  uploadAndSubmitSummaryLog
} from '../support/apicalls.js'
import { checkBodyText } from '../support/checks.js'
import { defraIdStub } from '../support/defra-id-stub.js'
import {
  secondTradingName as newTradingName,
  thirdTradingName as updatedTradingName,
  createPrnDetails
} from '../support/fixtures.js'
import { PrnHelper } from '../support/prn.helper.js'
import { switchToNewTabAndClosePreviousTab } from '../support/windowtabs.js'
import { createLinkAndLogin } from '../support/login-helper.js'

describe('Issuing Packing Recycling Notes (Exporter)', () => {
  it('Should be able to create, issue and reject PRNs for Wood (Exporter) @issueprnexp @smoketest', async function () {
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

    const user = await createLinkAndLogin(
      organisationDetails.refNo,
      migrationResponse.email
    )

    // Tonnage value expected from Summary Log files upload
    // Wood
    const expectedWasteBalance = '1,325.09'

    const filePath = `resources/sanity/exporter_${accNumber}_${regNumber}.xlsx`
    await uploadAndSubmitSummaryLog(
      organisationDetails.refNo,
      migrationResponse.registrationIds[0],
      defraIdStub.authHeader(user.userId),
      filePath
    )

    await DashboardPage.selectTableLink(1, 1)

    await WasteRecordsPage.createNewPERNLink()

    const originalWasteBalance = '1,528.09'
    const wasteBalanceHint = await CreatePRNPage.wasteBalanceHint()
    expect(wasteBalanceHint).toBe(
      `Your waste balance available for creating PERNs is ${originalWasteBalance} tonnes.`
    )

    const prnHelper = new PrnHelper(true)

    const pernDetails = createPrnDetails({
      materialDesc,
      accNumber,
      organisationDetails
    })

    await prnHelper.createAndCheckPrnDetails(pernDetails)

    await checkBodyText('Your available waste balance has been updated.', 10)
    await checkBodyText(
      'You can now issue this PERN through your PERNs page.',
      10
    )

    await PrnCreatedPage.returnToRegistrationPage()
    await DashboardPage.selectTableLink(1, 1)
    await WasteRecordsPage.managePERNsLink()

    // PRN Dashboard checks - Waste Balance Amount, Awaiting Authorisation table values
    let wasteBalanceAmount = await PrnDashboardPage.wasteBalanceAmount()
    expect(wasteBalanceAmount).toBe(expectedWasteBalance + ' tonnes')

    // Check cancel hint text
    const cancelHintText = await PrnDashboardPage.cancelHintText()
    expect(cancelHintText).toBe(
      'If you delete or cancel a PERN, its tonnage will be added to your available waste balance.'
    )
    const selectPERNHeadingText = await PrnDashboardPage.selectPrnHeadingText()
    expect(selectPERNHeadingText).toBe('Select a PERN')

    await prnHelper.checkAwaitingRows(pernDetails, 1)
    // End of PRN Dashboard checks

    await PrnDashboardPage.selectAwaitingLink(1)
    await prnHelper.checkViewPrnDetails(pernDetails)
    await PrnViewPage.returnToPERNList()

    // Issue the created PERN
    await PrnDashboardPage.selectAwaitingLink(1)
    await prnHelper.issuePrnAndUpdateDetails(pernDetails, 'EX')

    await PrnIssuedPage.viewPdfButton()
    await switchToNewTabAndClosePreviousTab()

    await prnHelper.checkViewPrnDetails(pernDetails)

    await PrnViewPage.returnToPERNList()

    const noPrnMessage = await PrnDashboardPage.getNoPrnMessage()
    expect(noPrnMessage).toBe('No PRNs or PERNs have been created yet.')

    await PrnDashboardPage.selectBackLink()

    wasteBalanceAmount = await WasteRecordsPage.wasteBalanceAmount()
    expect(wasteBalanceAmount).toBe(expectedWasteBalance + ' tonnes')

    // Create a new PERN
    await WasteRecordsPage.createNewPERNLink()

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

    await PrnCreatedPage.returnToRegistrationPage()
    await DashboardPage.selectTableLink(1, 1)

    await WasteRecordsPage.managePERNsLink()

    await prnHelper.checkAwaitingRows(newPernDetails, 1)

    await PrnDashboardPage.selectAwaitingLink(1)

    await prnHelper.checkViewPrnDetails(newPernDetails)

    await prnHelper.issuePrnAndUpdateDetails(newPernDetails, 'EX')
    await prnHelper.checkIssuedPageLinks()

    await PrnIssuedPage.returnToHomePage()
    await WasteRecordsPage.managePERNsLink()

    // Check issued PERNs
    await PrnDashboardPage.selectIssuedTab()
    await prnHelper.checkIssuedRows(pernDetails, 1)
    await prnHelper.checkIssuedRows(newPernDetails, 2)

    // Check first Issued PRN details
    await PrnDashboardPage.selectIssuedLink(1)
    await switchToNewTabAndClosePreviousTab()

    // Check Issued PERN details
    await prnHelper.checkViewPrnDetails(pernDetails)

    // Now RPD cancels the PERN
    await externalAPICancelPrn(pernDetails)

    await PrnViewPage.returnToPERNList()

    // See that on the PRN Dashboard page, only PERNs awaiting cancellation are shown
    const tableHeading = await PrnDashboardPage.getTableHeading()
    expect(tableHeading).toBe('PERNs awaiting cancellation')
    await prnHelper.checkAwaitingRows(pernDetails, 1)

    await PrnDashboardPage.selectBackLink()

    // Create another new PERN
    await WasteRecordsPage.createNewPERNLink()

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

    await PrnCreatedPage.pernsPageLink()

    // See that on the PRN Dashboard page, PERNs awaiting authorisation and cancellation are shown
    const awaitingAuthHeading = await PrnDashboardPage.getTableHeading()
    expect(awaitingAuthHeading).toBe('PERNs awaiting authorisation')

    await prnHelper.checkAwaitingRows(updatedPernDetails, 1)

    const awaitingCancellationHeading =
      await PrnDashboardPage.getTableHeading(2)
    expect(awaitingCancellationHeading).toBe('PERNs awaiting cancellation')
    await prnHelper.checkAwaitingRows(pernDetails, 1, 2)

    // Select awaiting cancellation PRN
    await PrnDashboardPage.selectAwaitingLink(1, 2)

    await prnHelper.checkViewPrnDetails(pernDetails)

    // Test back link of cancellation page
    await PrnViewPage.cancelPRNButton()

    const confirmCancelHeading = await ConfirmCancelPrnPage.headingText()
    expect(confirmCancelHeading).toBe('Confirm cancellation of this PERN')
    await ConfirmCancelPrnPage.selectBackLink()

    // Now cancel the PRN and return to PRN Dashboard page
    await prnHelper.cancelPRNAndReturnToPRNsDashboard(pernDetails)

    await PrnDashboardPage.selectCancelledTab()
    await prnHelper.checkCancelledRows(pernDetails, 1)
    await PrnDashboardPage.selectCancelledLink(1)
    await switchToNewTabAndClosePreviousTab()

    await prnHelper.checkViewPrnDetails(pernDetails)
    await PrnViewPage.returnToPERNList()
    // End of PERN cancellation test

    await PrnDashboardPage.selectBackLink()
    await WasteRecordsPage.selectBackLink()

    // Check that the waste balance has been updated from the cancelled PRN
    const expectedUpdatedWasteBalance = '1,494.09'
    const availableWasteBalance = await DashboardPage.availableWasteBalance(1)
    expect(availableWasteBalance).toBe(expectedUpdatedWasteBalance)

    await HomePage.signOut()
    await expect(browser).toHaveTitle(expect.stringContaining('Signed out'))
  })
})
