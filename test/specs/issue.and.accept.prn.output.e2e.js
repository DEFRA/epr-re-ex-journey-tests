import { test, expect } from '@playwright/test'
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
  externalAPIAcceptPrn,
  updateMigratedOrganisation
} from '../support/apicalls.js'
import { checkBodyText } from '../support/checks.js'
import { createPrnDetails } from '../support/fixtures.js'
import { PrnHelper } from '../support/prn.helper.js'
import { switchToNewTabAndClosePreviousTab } from '../support/windowtabs.js'
import { createLinkAndLogin } from '../support/login-helper.js'

test.describe('Issuing Packing Recycling Notes', () => {
  test('Should be able to create, issue and accept PRNs for Plastic (Reprocessor Output) @issueprnoutput @smoketest', async ({
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

    const regNumber = 'R25SR500010912PL'
    const accNumber = 'R-ACC12145PL'

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

    await wasteRecordsPage.submitSummaryLogLink()

    const filePath = `resources/sanity/reprocessorOutput_${accNumber}_${regNumber}.xlsx`
    const uploadSummaryLogPage = new UploadSummaryLogPage(currentPage)
    await uploadSummaryLogPage.performUploadAndReturnToHomepage(filePath)

    await dashboardPage.selectTableLink(1, 1)

    await wasteRecordsPage.createNewPRNLink()

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

    await prnCreatedPage.returnToRegistrationPage()
    await dashboardPage.selectTableLink(1, 1)
    await wasteRecordsPage.managePRNsLink()

    // Issue the created PRN
    await prnDashboardPage.selectAwaitingLink(1)
    await prnHelper.issuePrnAndUpdateDetails(prnDetails, 'WR', {
      checkDoubleClick: true
    })

    const prnIssuedPage = new PRNIssuedPage(currentPage)
    await prnIssuedPage.viewPdfButton()
    currentPage = await switchToNewTabAndClosePreviousTab(currentPage)

    prnHelper = new PrnHelper(currentPage)
    prnDashboardPage = new PRNDashboardPage(currentPage)
    const prnViewPage = new PRNViewPage(currentPage)

    await prnHelper.checkViewPrnDetails(prnDetails)
    await prnViewPage.returnToPRNList()

    await prnDashboardPage.selectBackLink()

    // RPD accepts the PRN
    await externalAPIAcceptPrn(prnDetails)

    const wasteRecordsPageOnNewTab = new WasteRecordsPage(currentPage)
    await wasteRecordsPageOnNewTab.managePRNsLink()

    await prnDashboardPage.selectIssuedTab()
    await prnHelper.checkIssuedRows(prnDetails, 1)

    await prnDashboardPage.selectIssuedLink(1)
    currentPage = await switchToNewTabAndClosePreviousTab(currentPage)

    prnHelper = new PrnHelper(currentPage)
    await prnHelper.checkViewPrnDetails(prnDetails)

    const homePageOnFinalTab = new HomePage(currentPage)
    await homePageOnFinalTab.signOut()
    await expect(currentPage).toHaveTitle(/Signed out/)
  })
})
