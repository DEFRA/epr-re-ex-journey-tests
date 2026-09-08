import { test, expect } from '@playwright/test'
import { CreatePRNPage } from 'page-objects/create.prn.page.js'
import { PRNCreatedPage } from 'page-objects/prn.created.page.js'
import { DashboardPage } from '../page-objects/dashboard.page.js'
import { WasteRecordsPage } from '../page-objects/waste.records.page.js'
import {
  createLinkedOrganisation,
  updateMigratedOrganisation
} from '../support/seeding/organisation.js'
import { uploadAndSubmitSummaryLog } from '../support/seeding/summary-logs.js'
import { defraIdStub } from '../support/defra-id-stub.js'
import { createLinkAndLogin } from '../support/login-helper.js'
import { createPrnDetails } from '../support/fixtures.js'
import { PrnHelper } from '../support/prn.helper.js'

test.describe('Marking a PRN as December Waste (Reprocessor Output)', () => {
  test('Should show the December waste question for an output reprocessor and record Yes @createDecPRNOutput', async ({
    page
  }) => {
    const regNumber = 'R26ER5000000001ST'
    const accNumber = 'A26ER5000000001ST'

    const createPRNPage = new CreatePRNPage(page)
    const prnCreatedPage = new PRNCreatedPage(page)
    const dashboardPage = new DashboardPage(page)
    const wasteRecordsPage = new WasteRecordsPage(page)
    const prnHelper = new PrnHelper(page)

    const organisationDetails = await createLinkedOrganisation([
      { material: 'Steel (R4)', wasteProcessingType: 'Reprocessor' }
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
  })
})
