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

    // TODO(PAE-1958): validFrom defaults to SEEDED_VALID_FROM (2026-01-01),
    // pinning the accreditation's relevant year to 2026. The December Waste
    // window closes 31 January 2027, so this spec starts failing after that
    // date even though the feature works. Seeding validFrom from the current
    // year instead would fix this but breaks the balance upload below: the
    // sanity fixture's row dates are fixed to when it was generated, and
    // isAccreditedAtDates would exclude them once validFrom moves past those
    // dates. Needs generating the summary log on the fly (dates relative to
    // "now") alongside a current-year validFrom, not just the validFrom change
    // alone.
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
