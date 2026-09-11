import { test, expect } from '@playwright/test'
import { CreatePRNPage } from 'page-objects/create.prn.page.js'
import { PRNCreatedPage } from 'page-objects/prn.created.page.js'
import { PRNDashboardPage } from 'page-objects/prn.dashboard.page.js'
import { PRNIssuedPage } from 'page-objects/prn.issued.page.js'
import { PRNViewPage } from 'page-objects/prn.view.page.js'
import { DashboardPage } from '../page-objects/dashboard.page.js'
import { WasteRecordsPage } from '../page-objects/waste.records.page.js'
import {
  createLinkedOrganisation,
  updateMigratedOrganisation
} from '../support/seeding/organisation.js'
import { uploadAndSubmitSummaryLog } from '../support/seeding/summary-logs.js'
import { externalAPICancelPrn } from '../support/seeding/prns.js'
import { defraIdStub } from '../support/defra-id-stub.js'
import { createLinkAndLogin } from '../support/login-helper.js'
import { createPrnDetails } from '../support/fixtures.js'
import { PrnHelper } from '../support/prn.helper.js'
import { switchToNewTabAndClosePreviousTab } from '../support/windowtabs.js'

test.describe('Marking a PRN as December Waste (Reprocessor Output)', () => {
  test('Should show the December waste question for an output reprocessor and record Yes @createDecPRNOutput', async ({
    page
  }) => {
    let currentPage = page
    const regNumber = 'R26ER5000000001ST'
    const accNumber = 'A26ER5000000001ST'

    let prnHelper, prnDashboardPage, prnIssuedPage, prnViewPage
    const createPRNPage = new CreatePRNPage(page)
    const prnCreatedPage = new PRNCreatedPage(page)
    const dashboardPage = new DashboardPage(page)
    const wasteRecordsPage = new WasteRecordsPage(page)

    const rebindPageObjects = () => {
      prnHelper = new PrnHelper(currentPage)
      prnDashboardPage = new PRNDashboardPage(currentPage)
      prnIssuedPage = new PRNIssuedPage(currentPage)
      prnViewPage = new PRNViewPage(currentPage)
    }
    rebindPageObjects()

    const organisationDetails = await createLinkedOrganisation([
      { material: 'Steel (R4)', wasteProcessingType: 'Reprocessor' }
    ])

    // TODO(PAE-1958): validFrom defaults to SEEDED_VALID_FROM (2026-01-01),
    // pinning the accreditation's relevant year to 2026. The December Waste
    // window closes 31 January 2027, so this spec starts failing after that
    // date even though the feature works. Regenerate the fixture via
    // generate-december-fixture.js's CLI (--year=<new year>) and re-seed this
    // spec's validFrom to match when that happens.
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
      page,
      organisationDetails.refNo,
      migrationResponse.email
    )

    await uploadAndSubmitSummaryLog(
      organisationDetails.refNo,
      migrationResponse.registrationIds[0],
      defraIdStub.authHeader(user.userId),
      `resources/sanity/reprocessorOutput_${accNumber}_${regNumber}.xlsx`
    )

    await dashboardPage.selectTableLink(1, 1)
    await wasteRecordsPage.createNewPRNLink().click()

    await createPRNPage.headingText()
    expect(await createPRNPage.decemberWasteVisible()).toBe(true)

    const prnDetails = createPrnDetails({
      accNumber,
      organisationDetails,
      materialDesc: 'Steel',
      process: 'R4',
      selectDecemberWasteAnswer: 'Yes'
    })

    await prnHelper.createAndCheckPrnDetails(prnDetails)

    const message = await prnCreatedPage.messageText()
    expect(message).toContain('created from December waste')

    await prnCreatedPage.returnToRegistrationPage().click()
    await dashboardPage.selectTableLink(1, 1)
    await wasteRecordsPage.managePRNsLink().click()

    // Awaiting-action table should mark this note as December Waste.
    await prnHelper.checkAwaitingRows(prnDetails, 1)

    await prnDashboardPage.selectAwaitingLink(1)
    await prnHelper.issuePrnAndUpdateDetails(prnDetails, 'WR')

    await prnIssuedPage.returnToHomeLink().click()
    await wasteRecordsPage.managePRNsLink().click()

    // Issued table should carry the same December Waste marker through.
    await prnDashboardPage.issuedTab().click()
    await prnHelper.checkIssuedRows(prnDetails, 1)

    // Check the issued PRN, then RPD requests cancellation
    await prnDashboardPage.selectIssuedLink(1)
    currentPage = await switchToNewTabAndClosePreviousTab(currentPage)
    rebindPageObjects()

    await externalAPICancelPrn(prnDetails)

    await prnViewPage.returnToPRNList().click()

    // Awaiting-action table should still carry the December Waste marker
    // now the note is awaiting cancellation.
    await prnHelper.checkAwaitingRows(prnDetails, 1)

    await prnDashboardPage.selectAwaitingLink(1)
    await prnHelper.cancelPRNAndReturnToPRNsDashboard(prnDetails)

    // Cancelled table should still carry the December Waste marker.
    await prnDashboardPage.cancelledTab().click()
    await prnHelper.checkCancelledRows(prnDetails, 1)
  })
})
