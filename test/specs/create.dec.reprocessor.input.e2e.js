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

test.describe('Choosing a waste balance pool for a PRN (Reprocessor Input)', () => {
  test('Should show both balance options and move only the chosen pool @decWaste @createDecPRNInput', async ({
    page
  }) => {
    const regNumber = 'R26ER5000000000DEC'
    const accNumber = 'A26ER5000000000DEC'

    const createPRNPage = new CreatePRNPage(page)
    const prnCreatedPage = new PRNCreatedPage(page)
    const dashboardPage = new DashboardPage(page)
    const wasteRecordsPage = new WasteRecordsPage(page)
    const prnHelper = new PrnHelper(page)

    const organisationDetails = await createLinkedOrganisation([
      { material: 'Paper or board (R3)', wasteProcessingType: 'Reprocessor' }
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
          reprocessingType: 'input',
          regNumber,
          accNumber,
          status: 'approved'
        }
      ],
      'sepa'
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
      `resources/sanity/reprocessorInput_${accNumber}_${regNumber}.xlsx`
    )

    await dashboardPage.selectTableLink(1, 1)

    // PAE-1921: in-window the single-balance banner gives way to the
    // Available waste balance breakdown panel. Its three figures must be
    // internally consistent and agree with the pool radios read below.
    const panelBefore = await wasteRecordsPage.decemberBalanceBreakdown()
    expect(panelBefore.total).toBeCloseTo(
      panelBefore.december + panelBefore.nonDecember,
      2
    )

    await wasteRecordsPage.createNewPRNLink().click()

    await createPRNPage.headingText()

    const options = await createPRNPage.wasteBalanceOptions()
    createPRNPage.assertWasteBalanceOrder(options)

    const insetText = await createPRNPage.wasteBalanceHint()
    expect(insetText).toContain('from either waste balance')

    const generalBefore = createPRNPage.wasteBalanceTonnage(
      options,
      'Non-December'
    )

    expect(panelBefore.nonDecember).toBeCloseTo(generalBefore, 2)

    // Raise from the non-December pool: proves AC3 (a general raise moves
    // only the general balance) and AC6 (December stays reserved out of it,
    // since the option already shown is total minus December).
    const prnDetails = createPrnDetails({
      accNumber,
      organisationDetails,
      materialDesc: 'Paper and board',
      process: 'R3',
      tonnageWordings: { integer: 2, word: 'Two' },
      wasteBalancePool: 'Non-December'
    })

    await prnHelper.createAndCheckPrnDetails(prnDetails)

    const message = await prnCreatedPage.messageText()
    expect(message).not.toContain('created from December waste')

    const decemberBefore = createPRNPage.wasteBalanceTonnage(
      options,
      'December'
    )

    expect(panelBefore.december).toBeCloseTo(decemberBefore, 2)

    const { december: decemberAfter, general: generalAfter } =
      await createPRNPage.reopenAndReadWasteBalances(
        dashboardPage,
        wasteRecordsPage,
        organisationDetails.refNo,
        false
      )

    expect(generalAfter).toBeCloseTo(generalBefore - 2, 2)
    expect(decemberAfter).toBeCloseTo(decemberBefore, 2)

    // Now raise from the other pool: proves the reverse direction too - a
    // December raise moves only the December figure, leaving the general
    // figure (already reduced above) untouched by this second raise.
    const secondPrnDetails = createPrnDetails({
      accNumber,
      organisationDetails,
      materialDesc: 'Paper and board',
      process: 'R3',
      tonnageWordings: { integer: 3, word: 'Three' },
      wasteBalancePool: 'December'
    })

    await prnHelper.createAndCheckPrnDetails(secondPrnDetails)

    const secondMessage = await prnCreatedPage.messageText()
    expect(secondMessage).toContain('created from December waste')

    const { december: decemberAfterSecond, general: generalAfterSecond } =
      await createPRNPage.reopenAndReadWasteBalances(
        dashboardPage,
        wasteRecordsPage,
        organisationDetails.refNo,
        false
      )

    expect(decemberAfterSecond).toBeCloseTo(decemberAfter - 3, 2)
    expect(generalAfterSecond).toBeCloseTo(generalAfter, 2)

    // The panel must move with the raises too: back on the registration
    // page it shows the same reduced figures the create-page radios do,
    // with the total down by the five tonnes raised across both pools.
    await dashboardPage.open(organisationDetails.refNo)
    await dashboardPage.selectTableLink(1, 1)

    const panelAfter = await wasteRecordsPage.decemberBalanceBreakdown()
    expect(panelAfter.december).toBeCloseTo(decemberAfterSecond, 2)
    expect(panelAfter.nonDecember).toBeCloseTo(generalAfterSecond, 2)
    expect(panelAfter.total).toBeCloseTo(panelBefore.total - 5, 2)
  })
})
