import { browser, expect } from '@wdio/globals'
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
  externalAPIAcceptPrn,
  updateMigratedOrganisation,
  uploadAndSubmitSummaryLog
} from '../support/apicalls.js'
import { checkBodyText } from '../support/checks.js'
import { defraIdStub } from '../support/defra-id-stub.js'
import { createPrnDetails } from '../support/fixtures.js'
import { PrnHelper } from '../support/prn.helper.js'
import { switchToNewTabAndClosePreviousTab } from '../support/windowtabs.js'
import { createLinkAndLogin } from '../support/login-helper.js'

describe('Issuing Packing Recycling Notes', () => {
  it('Should be able to create, issue and accept PRNs for Plastic (Reprocessor Output) @issueprnoutput @smoketest', async function () {
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

    const user = await createLinkAndLogin(
      organisationDetails.refNo,
      migrationResponse.email
    )

    // Tonnage value expected from Summary Log files upload
    // Plastic 56,455.67
    const filePath = `resources/sanity/reprocessorOutput_${accNumber}_${regNumber}.xlsx`
    await uploadAndSubmitSummaryLog(
      organisationDetails.refNo,
      migrationResponse.registrationIds[0],
      defraIdStub.authHeader(user.userId),
      filePath
    )

    await DashboardPage.selectTableLink(1, 1)

    await WasteRecordsPage.createNewPRNLink()

    const originalWasteBalance = '56,455.67'
    const wasteBalanceHint = await CreatePRNPage.wasteBalanceHint()
    expect(wasteBalanceHint).toBe(
      `Your waste balance available for creating PRNs is ${originalWasteBalance} tonnes.`
    )

    const prnHelper = new PrnHelper()

    const prnDetails = createPrnDetails({ accNumber, organisationDetails })

    await prnHelper.createAndCheckPrnDetails(prnDetails)

    await checkBodyText('Your available waste balance has been updated.', 10)
    await checkBodyText(
      'You can now issue this PRN through your PRNs page.',
      10
    )

    await PrnCreatedPage.returnToRegistrationPage()
    await DashboardPage.selectTableLink(1, 1)
    await WasteRecordsPage.managePRNsLink()

    // Issue the created PRN
    await PrnDashboardPage.selectAwaitingLink(1)
    await prnHelper.issuePrnAndUpdateDetails(prnDetails, 'WR', {
      checkDoubleClick: true
    })

    await PrnIssuedPage.viewPdfButton()
    await switchToNewTabAndClosePreviousTab()
    await prnHelper.checkViewPrnDetails(prnDetails)
    await PrnViewPage.returnToPRNList()

    await PrnDashboardPage.selectBackLink()

    // RPD accepts the PRN
    await externalAPIAcceptPrn(prnDetails)

    await WasteRecordsPage.managePRNsLink()

    await PrnDashboardPage.selectIssuedTab()
    await prnHelper.checkIssuedRows(prnDetails, 1)

    await PrnDashboardPage.selectIssuedLink(1)
    await switchToNewTabAndClosePreviousTab()
    await prnHelper.checkViewPrnDetails(prnDetails)

    await HomePage.signOut()
    await expect(browser).toHaveTitle(expect.stringContaining('Signed out'))
  })
})
