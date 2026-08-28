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
  updateMigratedOrganisation
} from '../support/seeding/organisation.js'
import { externalAPICancelPrn } from '../support/seeding/prns.js'
import { checkBodyText } from '../support/checks.js'
import {
  thirdTradingName as newTradingName,
  createPrnDetails
} from '../support/fixtures.js'
import { PrnHelper } from '../support/prn.helper.js'
import { switchToNewTabAndClosePreviousTab } from '../support/windowtabs.js'
import { createLinkAndLogin } from '../support/login-helper.js'

test.describe('Issuing Packing Recycling Notes', () => {
  test('Should be able to create, issue and reject PRNs for Paper (Reprocessor Input) @issueprnrepro @smoketest', async ({
    page
  }) => {
    // Trimmed to one full PRN lifecycle (create -> issue -> external cancel
    // -> UI cancel) plus a second, lighter-touch PRN that only proves the
    // Issued tab lists multiple rows correctly. The three-PRN scenario
    // (including two status tables shown simultaneously) still lives in
    // issue.and.reject.prn.exporter.e2e.js.
    //
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

    const regNumber = 'R26ER5000000000PA'
    const accNumber = 'A26ER5000000000PA'

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

    await wasteRecordsPage.submitSummaryLogLink().click()

    const filePath = `resources/sanity/reprocessorInput_${accNumber}_${regNumber}.xlsx`
    const uploadSummaryLogPage = new UploadSummaryLogPage(currentPage)
    await uploadSummaryLogPage.performUploadAndReturnToHomepage(filePath)

    await dashboardPage.selectTableLink(1, 1)

    await wasteRecordsPage.createNewPRNLink().click()

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
    await wasteRecordsPage.managePRNsLink().click()

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

    // Issue the created PRN
    await prnDashboardPage.selectAwaitingLink(1)
    await prnHelper.issuePrnAndUpdateDetails(prnDetails)

    await prnIssuedPage.viewPdfButton().click()
    currentPage = await switchToNewTabAndClosePreviousTab(currentPage)
    rebindPageObjects()
    await prnHelper.checkViewPrnDetails(prnDetails)
    await prnViewPage.returnToPRNList().click()

    const noPrnMessage = await prnDashboardPage.getNoPrnMessage()
    expect(noPrnMessage).toBe('No PRNs or PERNs have been created yet.')

    await prnDashboardPage.backLink().click()

    wasteBalanceAmount = await wasteRecordsPage.wasteBalanceAmount()
    expect(wasteBalanceAmount).toBe(expectedWasteBalance + ' tonnes')

    // Create a new PRN
    await wasteRecordsPage.createNewPRNLink().click()

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

    await wasteRecordsPage.managePRNsLink().click()

    await prnHelper.checkAwaitingRows(newPrnDetails, 1)

    await prnDashboardPage.selectAwaitingLink(1)
    await prnHelper.issuePrnAndUpdateDetails(newPrnDetails)

    // Both Manage PRNs and Issue another PRN links should point to the same page
    await prnHelper.checkIssuedPageLinks()

    await prnIssuedPage.returnToHomeLink().click()
    await wasteRecordsPage.managePRNsLink().click()

    // Check issued PRNs
    await prnDashboardPage.issuedTab().click()
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

    await prnViewPage.returnToPRNList().click()

    // See that on the PRN Dashboard page, only PRNs awaiting cancellation are shown
    const tableHeading = await prnDashboardPage.getTableHeading()
    expect(tableHeading).toBe('PRNs awaiting cancellation')
    await prnHelper.checkAwaitingRows(prnDetails, 1)

    // Select the now awaiting-cancellation PRN
    await prnDashboardPage.selectAwaitingLink(1)

    await prnHelper.checkViewPrnDetails(prnDetails)

    // Test back link of cancellation page
    await prnViewPage.cancelPRNButton().click()

    const confirmCancelHeading = await confirmCancelPrnPage.headingText()
    expect(confirmCancelHeading).toBe('Confirm cancellation of this PRN')
    await confirmCancelPrnPage.backLink().click()

    // Now cancel the PRN and return to PRN Dashboard page
    await prnHelper.cancelPRNAndReturnToPRNsDashboard(prnDetails, {
      checkDoubleClick: true
    })

    await prnDashboardPage.cancelledTab().click()
    await prnHelper.checkCancelledRows(prnDetails, 1)
    await prnDashboardPage.selectCancelledLink(1)
    currentPage = await switchToNewTabAndClosePreviousTab(currentPage)
    rebindPageObjects()

    await prnHelper.checkViewPrnDetails(prnDetails)
    await prnViewPage.returnToPRNList().click()

    await prnDashboardPage.backLink().click()
    await wasteRecordsPage.backLink().click()

    // Check that the waste balance has been updated from the cancelled PRN
    // (40,608.86 original - 19 reserved by the still-issued second PRN)
    const availableWasteBalance = await dashboardPage.availableWasteBalance(1)
    expect(availableWasteBalance).toBe('40,589.86')

    await homePage.signOutLink().click()
    await expect(currentPage).toHaveTitle(/Signed out/)
  })
})
