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
  createLinkedOrganisation,
  externalAPICancelPrn,
  updateMigratedOrganisation,
  uploadAndSubmitSummaryLog
} from '../support/apicalls.js'
import { checkBodyText } from '../support/checks.js'
import { defraIdStub } from '../support/defra-id-stub.js'
import {
  thirdTradingName as newTradingName,
  thirdTradingName as updatedTradingName,
  createPrnDetails
} from '../support/fixtures.js'
import { PrnHelper } from '../support/prn.helper.js'
import { switchToNewTabAndClosePreviousTab } from '../support/windowtabs.js'
import { createLinkAndLogin } from '../support/login-helper.js'

describe('Issuing Packing Recycling Notes', () => {
  it('Should be able to create, issue and reject PRNs for Paper (Reprocessor Input) @issueprnrepro @smoketest', async function () {
    const regNumber = 'R25SR500000912PA'
    const accNumber = 'R-ACC12045PA'

    const materialDesc = 'Paper and board'

    const organisationDetails = await createLinkedOrganisation([
      { material: 'Paper or board (R3)', wasteProcessingType: 'Reprocessor' }
    ])

    const migrationResponse = await updateMigratedOrganisation(
      organisationDetails.refNo,
      [
        {
          reprocessingType: 'input',
          regNumber,
          accNumber,
          status: 'approved'
        }
      ],
      'sepa'
    )

    const user = await createLinkAndLogin(
      organisationDetails.refNo,
      migrationResponse.email
    )

    // Tonnage value expected from Summary Log files upload
    // Paper and board	40,608.86
    const expectedWasteBalance = '40,405.86'

    const filePath = `resources/sanity/reprocessorInput_${accNumber}_${regNumber}.xlsx`
    await uploadAndSubmitSummaryLog(
      organisationDetails.refNo,
      migrationResponse.registrationIds[0],
      defraIdStub.authHeader(user.userId),
      filePath
    )

    await DashboardPage.selectTableLink(1, 1)

    await WasteRecordsPage.createNewPRNLink()

    const originalWasteBalance = '40,608.86'
    const wasteBalanceHint = await CreatePRNPage.wasteBalanceHint()
    expect(wasteBalanceHint).toBe(
      `Your waste balance available for creating PRNs is ${originalWasteBalance} tonnes.`
    )

    const prnHelper = new PrnHelper()

    const prnDetails = createPrnDetails({
      materialDesc,
      accNumber,
      organisationDetails
    })

    await prnHelper.createAndCheckPrnDetails(prnDetails)

    await checkBodyText('Your available waste balance has been updated.', 10)
    await checkBodyText(
      'You can now issue this PRN through your PRNs page.',
      10
    )

    await PrnCreatedPage.returnToRegistrationPage()
    await DashboardPage.selectTableLink(1, 1)
    await WasteRecordsPage.managePRNsLink()

    // PRN Dashboard checks - Waste Balance Amount, Awaiting Authorisation table values
    let wasteBalanceAmount = await PrnDashboardPage.wasteBalanceAmount()
    expect(wasteBalanceAmount).toBe(expectedWasteBalance + ' tonnes')

    // Check cancel hint text
    const cancelHintText = await PrnDashboardPage.cancelHintText()
    expect(cancelHintText).toBe(
      'If you delete or cancel a PRN, its tonnage will be added to your available waste balance.'
    )
    const selectPRNHeadingText = await PrnDashboardPage.selectPrnHeadingText()
    expect(selectPRNHeadingText).toBe('Select a PRN')

    await prnHelper.checkAwaitingRows(prnDetails, 1)

    // End of PRN Dashboard checks
    await PrnDashboardPage.selectAwaitingLink(1)
    await prnHelper.checkViewPrnDetails(prnDetails)
    await PrnViewPage.returnToPRNList()

    // Issue the created PRN
    await PrnDashboardPage.selectAwaitingLink(1)
    await prnHelper.issuePrnAndUpdateDetails(prnDetails)

    await PrnIssuedPage.viewPdfButton()
    await switchToNewTabAndClosePreviousTab()
    await prnHelper.checkViewPrnDetails(prnDetails)
    await PrnViewPage.returnToPRNList()

    const noPrnMessage = await PrnDashboardPage.getNoPrnMessage()
    expect(noPrnMessage).toBe('No PRNs or PERNs have been created yet.')

    await PrnDashboardPage.selectBackLink()

    wasteBalanceAmount = await WasteRecordsPage.wasteBalanceAmount()
    expect(wasteBalanceAmount).toBe(expectedWasteBalance + ' tonnes')

    // Create a new PRN
    await WasteRecordsPage.createNewPRNLink()

    const newTonnageWordings = {
      integer: 19,
      word: 'Nineteen'
    }
    const newIssuerNotes = 'Testing another PRN'

    const newPrnDetails = createPrnDetails({
      tonnageWordings: newTonnageWordings,
      tradingName: newTradingName,
      issuerNotes: newIssuerNotes,
      materialDesc,
      accNumber,
      organisationDetails
    })

    await prnHelper.createAndCheckPrnDetails(newPrnDetails)
    // End of new PRN creation

    await PrnCreatedPage.returnToRegistrationPage()
    await DashboardPage.selectTableLink(1, 1)

    await WasteRecordsPage.managePRNsLink()

    await prnHelper.checkAwaitingRows(newPrnDetails, 1)

    await PrnDashboardPage.selectAwaitingLink(1)

    await prnHelper.checkViewPrnDetails(newPrnDetails)
    await prnHelper.issuePrnAndUpdateDetails(newPrnDetails)

    // Both Manage PRNs and Issue another PRN links should point to the same page
    await prnHelper.checkIssuedPageLinks()

    await PrnIssuedPage.returnToHomePage()
    await WasteRecordsPage.managePRNsLink()

    // Check issued PRNs
    await PrnDashboardPage.selectIssuedTab()
    await prnHelper.checkIssuedRows(prnDetails, 1)
    await prnHelper.checkIssuedRows(newPrnDetails, 2)

    // Check first Issued PRN details
    await PrnDashboardPage.selectIssuedLink(1)
    await switchToNewTabAndClosePreviousTab()

    // Check Issued PRN details
    await prnHelper.checkViewPrnDetails(prnDetails)

    // Now RPD cancels the PRN
    await externalAPICancelPrn(prnDetails)

    await PrnViewPage.returnToPRNList()

    // See that on the PRN Dashboard page, only PRNs awaiting cancellation are shown
    const tableHeading = await PrnDashboardPage.getTableHeading()
    expect(tableHeading).toBe('PRNs awaiting cancellation')
    await prnHelper.checkAwaitingRows(prnDetails, 1)

    await PrnDashboardPage.selectBackLink()

    // Create another new PRN
    await WasteRecordsPage.createNewPRNLink()

    const updatedTonnageWordings = {
      integer: 15,
      word: 'Fifteen'
    }

    const updatedPrnDetails = createPrnDetails({
      tonnageWordings: updatedTonnageWordings,
      tradingName: updatedTradingName,
      issuerNotes: newIssuerNotes,
      materialDesc,
      accNumber,
      organisationDetails
    })

    await prnHelper.createAndCheckPrnDetails(updatedPrnDetails)

    // End of new PRN creation
    await PrnCreatedPage.prnsPageLink()

    // See that on the PRN Dashboard page, PRNs awaiting authorisation and cancellation are shown
    const awaitingAuthHeading = await PrnDashboardPage.getTableHeading()
    expect(awaitingAuthHeading).toBe('PRNs awaiting authorisation')

    await prnHelper.checkAwaitingRows(updatedPrnDetails, 1)

    const awaitingCancellationHeading =
      await PrnDashboardPage.getTableHeading(2)
    expect(awaitingCancellationHeading).toBe('PRNs awaiting cancellation')
    await prnHelper.checkAwaitingRows(prnDetails, 1, 2)

    // Select awaiting cancellation PRN
    await PrnDashboardPage.selectAwaitingLink(1, 2)

    await prnHelper.checkViewPrnDetails(prnDetails)

    // Test back link of cancellation page
    await PrnViewPage.cancelPRNButton()

    const confirmCancelHeading = await ConfirmCancelPrnPage.headingText()
    expect(confirmCancelHeading).toBe('Confirm cancellation of this PRN')
    await ConfirmCancelPrnPage.selectBackLink()

    // Now cancel the PRN and return to PRN Dashboard page
    await prnHelper.cancelPRNAndReturnToPRNsDashboard(prnDetails, {
      checkDoubleClick: true
    })

    await PrnDashboardPage.selectCancelledTab()
    await prnHelper.checkCancelledRows(prnDetails, 1)
    await PrnDashboardPage.selectCancelledLink(1)
    await switchToNewTabAndClosePreviousTab()

    await prnHelper.checkViewPrnDetails(prnDetails)
    await PrnViewPage.returnToPRNList()

    await PrnDashboardPage.selectBackLink()
    await WasteRecordsPage.selectBackLink()

    // Check that the waste balance has been updated from the cancelled PRN
    const availableWasteBalance = await DashboardPage.availableWasteBalance(1)
    expect(availableWasteBalance).toBe('40,574.86')

    await HomePage.signOut()
    await expect(browser).toHaveTitle(expect.stringContaining('Signed out'))
  })
})
