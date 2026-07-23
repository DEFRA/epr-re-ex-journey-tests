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
  createLinkedOrganisation,
  externalAPICancelPrn,
  updateMigratedOrganisation
} from '../support/apicalls.js'
import { checkBodyText } from '../support/checks.js'
import {
  thirdTradingName as newTradingName,
  thirdTradingName as updatedTradingName,
  createPrnDetails
} from '../support/fixtures.js'
import { PrnHelper } from '../support/prn.helper.js'
import { switchToNewTabAndClosePreviousTab } from '../support/windowtabs.js'
import { createLinkAndLogin } from '../support/login-helper.js'

test.describe('Issuing Packing Recycling Notes', () => {
  test('Should be able to create, issue and reject PRNs for Paper (Reprocessor Input) @issueprnrepro @smoketest', async ({
    page
  }) => {
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
      prnCreatedPage,
      prnDashboardPage,
      prnViewPage,
      prnIssuedPage,
      confirmCancelPrnPage

    const rebindPageObjects = () => {
      prnHelper = new PrnHelper(currentPage)
      homePage = new HomePage(currentPage)
      dashboardPage = new DashboardPage(currentPage)
      wasteRecordsPage = new WasteRecordsPage(currentPage)
      createPRNPage = new CreatePRNPage(currentPage)
      prnCreatedPage = new PRNCreatedPage(currentPage)
      prnDashboardPage = new PRNDashboardPage(currentPage)
      prnViewPage = new PRNViewPage(currentPage)
      prnIssuedPage = new PRNIssuedPage(currentPage)
      confirmCancelPrnPage = new ConfirmCancelPRNPage(currentPage)
    }
    rebindPageObjects()

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

    await createLinkAndLogin(
      currentPage,
      organisationDetails.refNo,
      migrationResponse.email
    )

    // Tonnage value expected from Summary Log files upload
    // Paper and board	40,608.86
    const expectedWasteBalance = '40,405.86'

    await dashboardPage.selectTableLink(1, 1)

    await wasteRecordsPage.submitSummaryLogLink()

    const filePath = `resources/sanity/reprocessorInput_${accNumber}_${regNumber}.xlsx`
    const uploadSummaryLogPage = new UploadSummaryLogPage(currentPage)
    await uploadSummaryLogPage.performUploadAndReturnToHomepage(filePath)

    await dashboardPage.selectTableLink(1, 1)

    await wasteRecordsPage.createNewPRNLink()

    const originalWasteBalance = '40,608.86'
    const wasteBalanceHint = await createPRNPage.wasteBalanceHint()
    expect(wasteBalanceHint).toBe(
      `Your waste balance available for creating PRNs is ${originalWasteBalance} tonnes.`
    )

    const prnDetails = createPrnDetails({
      materialDesc,
      accNumber,
      organisationDetails
    })

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

    await prnCreatedPage.returnToRegistrationPage()
    await dashboardPage.selectTableLink(1, 1)
    await wasteRecordsPage.managePRNsLink()

    // PRN Dashboard checks - Waste Balance Amount, Awaiting Authorisation table values
    let wasteBalanceAmount = await prnDashboardPage.wasteBalanceAmount()
    expect(wasteBalanceAmount).toBe(expectedWasteBalance + ' tonnes')

    // Check cancel hint text
    const cancelHintText = await prnDashboardPage.cancelHintText()
    expect(cancelHintText).toBe(
      'If you delete or cancel a PRN, its tonnage will be added to your available waste balance.'
    )
    const selectPRNHeadingText = await prnDashboardPage.selectPrnHeadingText()
    expect(selectPRNHeadingText).toBe('Select a PRN')

    await prnHelper.checkAwaitingRows(prnDetails, 1)

    // End of PRN Dashboard checks
    await prnDashboardPage.selectAwaitingLink(1)
    await prnHelper.checkViewPrnDetails(prnDetails)
    await prnViewPage.returnToPRNList()

    // Issue the created PRN
    await prnDashboardPage.selectAwaitingLink(1)
    await prnHelper.issuePrnAndUpdateDetails(prnDetails)

    await prnIssuedPage.viewPdfButton()
    currentPage = await switchToNewTabAndClosePreviousTab(currentPage)
    rebindPageObjects()
    await prnHelper.checkViewPrnDetails(prnDetails)
    await prnViewPage.returnToPRNList()

    const noPrnMessage = await prnDashboardPage.getNoPrnMessage()
    expect(noPrnMessage).toBe('No PRNs or PERNs have been created yet.')

    await prnDashboardPage.selectBackLink()

    wasteBalanceAmount = await wasteRecordsPage.wasteBalanceAmount()
    expect(wasteBalanceAmount).toBe(expectedWasteBalance + ' tonnes')

    // Create a new PRN
    await wasteRecordsPage.createNewPRNLink()

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

    await prnCreatedPage.returnToRegistrationPage()
    await dashboardPage.selectTableLink(1, 1)

    await wasteRecordsPage.managePRNsLink()

    await prnHelper.checkAwaitingRows(newPrnDetails, 1)

    await prnDashboardPage.selectAwaitingLink(1)

    await prnHelper.checkViewPrnDetails(newPrnDetails)
    await prnHelper.issuePrnAndUpdateDetails(newPrnDetails)

    // Both Manage PRNs and Issue another PRN links should point to the same page
    await prnHelper.checkIssuedPageLinks()

    await prnIssuedPage.returnToHomePage()
    await wasteRecordsPage.managePRNsLink()

    // Check issued PRNs
    await prnDashboardPage.selectIssuedTab()
    await prnHelper.checkIssuedRows(prnDetails, 1)
    await prnHelper.checkIssuedRows(newPrnDetails, 2)

    // Check first Issued PRN details
    await prnDashboardPage.selectIssuedLink(1)
    currentPage = await switchToNewTabAndClosePreviousTab(currentPage)
    rebindPageObjects()

    // Check Issued PRN details
    await prnHelper.checkViewPrnDetails(prnDetails)

    // Now RPD cancels the PRN
    await externalAPICancelPrn(prnDetails)

    await prnViewPage.returnToPRNList()

    // See that on the PRN Dashboard page, only PRNs awaiting cancellation are shown
    const tableHeading = await prnDashboardPage.getTableHeading()
    expect(tableHeading).toBe('PRNs awaiting cancellation')
    await prnHelper.checkAwaitingRows(prnDetails, 1)

    await prnDashboardPage.selectBackLink()

    // Create another new PRN
    await wasteRecordsPage.createNewPRNLink()

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
    await prnCreatedPage.prnsPageLink()

    // See that on the PRN Dashboard page, PRNs awaiting authorisation and cancellation are shown
    const awaitingAuthHeading = await prnDashboardPage.getTableHeading()
    expect(awaitingAuthHeading).toBe('PRNs awaiting authorisation')

    await prnHelper.checkAwaitingRows(updatedPrnDetails, 1)

    const awaitingCancellationHeading =
      await prnDashboardPage.getTableHeading(2)
    expect(awaitingCancellationHeading).toBe('PRNs awaiting cancellation')
    await prnHelper.checkAwaitingRows(prnDetails, 1, 2)

    // Select awaiting cancellation PRN
    await prnDashboardPage.selectAwaitingLink(1, 2)

    await prnHelper.checkViewPrnDetails(prnDetails)

    // Test back link of cancellation page
    await prnViewPage.cancelPRNButton()

    const confirmCancelHeading = await confirmCancelPrnPage.headingText()
    expect(confirmCancelHeading).toBe('Confirm cancellation of this PRN')
    await confirmCancelPrnPage.selectBackLink()

    // Now cancel the PRN and return to PRN Dashboard page
    await prnHelper.cancelPRNAndReturnToPRNsDashboard(prnDetails, {
      checkDoubleClick: true
    })

    await prnDashboardPage.selectCancelledTab()
    await prnHelper.checkCancelledRows(prnDetails, 1)
    await prnDashboardPage.selectCancelledLink(1)
    currentPage = await switchToNewTabAndClosePreviousTab(currentPage)
    rebindPageObjects()

    await prnHelper.checkViewPrnDetails(prnDetails)
    await prnViewPage.returnToPRNList()

    await prnDashboardPage.selectBackLink()
    await wasteRecordsPage.selectBackLink()

    // Check that the waste balance has been updated from the cancelled PRN
    const availableWasteBalance = await dashboardPage.availableWasteBalance(1)
    expect(availableWasteBalance).toBe('40,574.86')

    await homePage.signOut()
    await expect(currentPage).toHaveTitle(/Signed out/)
  })
})
