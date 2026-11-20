import { test, expect } from '@playwright/test'

import { AdminLoginPage } from 'page-objects/admin/login.page'
import { PrnActivityPage } from 'page-objects/admin/prn.activity.page'
import { PrnTonnagePage } from 'page-objects/admin/prn.tonnage.page'
import { ChooseYearPage } from 'page-objects/choose.year.page.js'
import { CreatePRNPage } from 'page-objects/create.prn.page.js'
import { DashboardPage } from 'page-objects/dashboard.page.js'
import { PRNCreatedPage } from 'page-objects/prn.created.page.js'
import { PRNDashboardPage } from 'page-objects/prn.dashboard.page.js'
import { UploadSummaryLogPage } from 'page-objects/upload.summary.log.page.js'
import { WasteRecordsPage } from 'page-objects/waste.records.page.js'
import {
  createLinkedOrganisation,
  seedExternalAccreditation,
  seedOverseasSites,
  updateMigratedOrganisation
} from '../../support/seeding/organisation.js'
import { generateSpreadsheetData } from '../../support/spreadsheet/summarylogs-spreadsheet-data-generator.js'
import { createLinkAndLogin } from '../../support/login-helper.js'
import { createPrnDetails } from '../../support/fixtures.js'
import { PrnHelper } from '../../support/prn.helper.js'
import { generateNumbers } from '../../support/reg-acc-number.js'
import { checkWasteBalanceForWindow } from '../../support/waste-balance-mode.js'
import { isDecemberWasteWindowOpenFor } from '../../support/december-waste-window.js'
import { checkOnUploadPage } from '../../support/summary-log-checks.js'

// The 2027 accreditation is held outside re-ex, and is open early in this
// stack. The PERN raised against it is found in each report by its own
// numbers, so other journeys running alongside do not disturb it.
const YEAR = 2027
const EXPORTED_TONNES = 400
const PERN_TONNES = 40

test.describe('PRN reports for an accreditation held outside re-ex @prnActivity @prnTonnage', () => {
  test.describe.configure({ mode: 'serial', timeout: 4 * 60 * 1000 })

  /** @type {string} */
  let accNumber2027
  /** @type {string} */
  let pernNumber

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage()
    const dashboardPage = new DashboardPage(page)
    const chooseYearPage = new ChooseYearPage(page)
    const wasteRecordsPage = new WasteRecordsPage(page)
    const prnHelper = new PrnHelper(page, true)

    const numbering = /** @type {const} */ ({
      wasteProcessingType: 'exporter',
      materialSuffix: 'WO'
    })
    const { regNumber, accNumber: accNumber2026 } = generateNumbers({
      ...numbering,
      year: '26'
    })
    const organisationDetails = await createLinkedOrganisation([
      { material: 'Wood (R3)', wasteProcessingType: 'Exporter' }
    ])
    const { email } = await updateMigratedOrganisation(
      organisationDetails.refNo,
      [
        {
          regNumber,
          accNumber: accNumber2026,
          status: 'approved',
          validTo: '2027-01-01',
          createdOn: '2025-12-31'
        }
      ],
      undefined,
      '2026-01-01'
    )
    await seedOverseasSites(organisationDetails.refNo)
    ;({ accreditationNumber: accNumber2027 } = await seedExternalAccreditation(
      {
        organisationNumber: organisationDetails.orgId,
        registrationNumber: regNumber
      },
      YEAR,
      numbering
    ))

    const summaryLog = await generateSpreadsheetData({
      ...numbering,
      regNumber,
      accNumber: accNumber2027,
      rows: {
        'Exported (sections 1, 2 and 3)': [
          {
            fields: {
              WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE: 'No',
              DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE: 'No',
              WAS_THE_WASTE_REFUSED: 'No',
              WAS_THE_WASTE_STOPPED: 'No',
              OSR_ID: 100,
              TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: EXPORTED_TONNES,
              DATE_RECEIVED_FOR_EXPORT: '01/01/2027',
              DATE_OF_EXPORT: '01/01/2027',
              DATE_RECEIVED_BY_OSR: '01/01/2027',
              DATE_THE_REFUSED_STOPPED_WASTE_REPATRIATED: '01/01/2027'
            }
          }
        ]
      },
      year: YEAR,
      silentLogging: true
    })

    const openAccreditation = async () => {
      await dashboardPage.open(organisationDetails.refNo)
      await dashboardPage.chooseDifferentYearLink().click()
      await chooseYearPage.yearOption(YEAR).check()
      await chooseYearPage.continueButton().click()
      await dashboardPage.expectYear(YEAR)
      await dashboardPage.selectTableLink(1, 1)
      await wasteRecordsPage.expectYear(YEAR)
    }

    try {
      await createLinkAndLogin(page, organisationDetails.refNo, email)

      await openAccreditation()
      await wasteRecordsPage.submitSummaryLogLink().click()
      await checkOnUploadPage(page, YEAR)
      await new UploadSummaryLogPage(page).performUploadAndReturnToHomepage(
        summaryLog,
        YEAR
      )

      await openAccreditation()
      await wasteRecordsPage.createNewPERNLink().click()
      const pernDetails = createPrnDetails({
        materialDesc: 'Wood',
        accNumber: accNumber2027,
        organisationDetails,
        tonnageWordings: { integer: PERN_TONNES, word: 'Forty' },
        wasteBalancePool: await checkWasteBalanceForWindow(
          new CreatePRNPage(page),
          isDecemberWasteWindowOpenFor(YEAR),
          '400.00',
          'PERNs'
        )
      })
      await prnHelper.createAndCheckPrnDetails(pernDetails)
      await new PRNCreatedPage(page).returnToRegistrationPage().click()

      await openAccreditation()
      await wasteRecordsPage.managePERNsLink().click()
      await new PRNDashboardPage(page).selectAwaitingLink(1)
      await prnHelper.issuePrnAndUpdateDetails(pernDetails, 'EX')
      pernNumber = pernDetails.prnNumber
    } finally {
      await page.close()
    }
  })

  test('PRN activity lists the PERN under its 2027 accreditation', async ({
    page
  }) => {
    await new AdminLoginPage(page).loginAsServiceMaintainer()
    const prnActivityPage = new PrnActivityPage(page)
    await prnActivityPage.open()

    const row = await prnActivityPage.rowFor(pernNumber)
    expect(row['Accreditation Year']).toBe(String(YEAR))
  })

  test("PRN tonnage reports the PERN's tonnage against its 2027 accreditation", async ({
    page
  }) => {
    await new AdminLoginPage(page).loginAsServiceMaintainer()
    const prnTonnagePage = new PrnTonnagePage(page)
    await prnTonnagePage.openResults()

    const row = await prnTonnagePage.rowFor(accNumber2027)
    expect(Number.parseFloat(row['Awaiting acceptance'])).toBe(PERN_TONNES)
  })
})
