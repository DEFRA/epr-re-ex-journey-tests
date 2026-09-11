import { test, expect } from '@playwright/test'
import { CreatePRNPage } from 'page-objects/create.prn.page.js'
import { PRNCreatedPage } from 'page-objects/prn.created.page.js'
import { DashboardPage } from '../page-objects/dashboard.page.js'
import { WasteRecordsPage } from '../page-objects/waste.records.page.js'
import {
  createLinkedOrganisation,
  updateMigratedOrganisation,
  seedOverseasSites
} from '../support/seeding/organisation.js'
import { uploadAndSubmitSummaryLog } from '../support/seeding/summary-logs.js'
import { defraIdStub } from '../support/defra-id-stub.js'
import { createLinkAndLogin } from '../support/login-helper.js'
import { createPrnDetails } from '../support/fixtures.js'
import { PrnHelper } from '../support/prn.helper.js'

test.describe('Choosing a waste balance pool for a PERN (Exporter)', () => {
  test('Should show both balance options and move only the chosen pool @createDecPRNExporter', async ({
    page
  }) => {
    const regNumber = 'R26EX5000000002DEC'
    const accNumber = 'A26EX5000000002DEC'

    const createPRNPage = new CreatePRNPage(page)
    const prnCreatedPage = new PRNCreatedPage(page)
    const dashboardPage = new DashboardPage(page)
    const wasteRecordsPage = new WasteRecordsPage(page)
    const prnHelper = new PrnHelper(page, true)

    const organisationDetails = await createLinkedOrganisation([
      { material: 'Wood (R3)', wasteProcessingType: 'Exporter' }
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
          regNumber,
          accNumber,
          status: 'approved'
        }
      ]
    )

    await seedOverseasSites(organisationDetails.refNo)

    const user = await createLinkAndLogin(
      page,
      organisationDetails.refNo,
      migrationResponse.email
    )

    await uploadAndSubmitSummaryLog(
      organisationDetails.refNo,
      migrationResponse.registrationIds[0],
      defraIdStub.authHeader(user.userId),
      `resources/sanity/exporter_${accNumber}_${regNumber}.xlsx`
    )

    await dashboardPage.selectTableLink(1, 1)
    await wasteRecordsPage.createNewPERNLink().click()

    await createPRNPage.headingText()

    const options = await createPRNPage.wasteBalanceOptions()
    expect(options).toHaveLength(2)
    expect(options[0]).toMatch(
      /December waste balance \(\d[\d,]*\.\d{2} tonnes\)/
    )
    expect(options[1]).toMatch(
      /Non-December waste balance \(\d[\d,]*\.\d{2} tonnes\)/
    )

    const insetText = await createPRNPage.wasteBalanceHint()
    expect(insetText).toContain('from either waste balance')

    const [, decemberBefore] = options[0].match(/\(([\d,.]+) tonnes\)/)
    const [, generalBefore] = options[1].match(/\(([\d,.]+) tonnes\)/)

    const prnDetails = createPrnDetails({
      accNumber,
      organisationDetails,
      materialDesc: 'Wood',
      process: 'R3',
      tonnageWordings: { integer: 2, word: 'Two' },
      wasteBalancePool: 'December'
    })

    await prnHelper.createAndCheckPrnDetails(prnDetails)

    const message = await prnCreatedPage.messageText()
    expect(message).toContain('created from December waste')

    // Only the December pool should have moved: raising back on the create
    // page shows the general figure unchanged and the December figure
    // reduced by the raised tonnage.
    await dashboardPage.open(organisationDetails.refNo)
    await dashboardPage.selectTableLink(1, 1)
    await wasteRecordsPage.createNewPERNLink().click()
    await createPRNPage.headingText()

    const optionsAfter = await createPRNPage.wasteBalanceOptions()
    const [, decemberAfter] = optionsAfter[0].match(/\(([\d,.]+) tonnes\)/)
    const [, generalAfter] = optionsAfter[1].match(/\(([\d,.]+) tonnes\)/)

    const toNumber = (s) => parseFloat(s.replace(/,/g, ''))
    expect(toNumber(decemberAfter)).toBeCloseTo(toNumber(decemberBefore) - 2, 2)
    expect(toNumber(generalAfter)).toBeCloseTo(toNumber(generalBefore), 2)
  })
})
