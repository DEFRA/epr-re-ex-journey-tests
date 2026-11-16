import { test, expect } from '@playwright/test'
import { ChooseYearPage } from 'page-objects/choose.year.page.js'
import { CreatePRNPage } from 'page-objects/create.prn.page.js'
import { DashboardPage } from 'page-objects/dashboard.page.js'
import { PRNCreatedPage } from 'page-objects/prn.created.page.js'
import { UploadSummaryLogPage } from 'page-objects/upload.summary.log.page.js'
import { WasteRecordsPage } from 'page-objects/waste.records.page.js'
import {
  createLinkedOrganisation,
  seedExternalAccreditation,
  seedOverseasSites,
  updateMigratedOrganisation
} from '~/test/support/seeding/organisation.js'
import { summaryLogDatedAt } from '~/test/support/seeding/summary-logs.js'
import { generateSpreadsheetData } from '~/test/support/spreadsheet/summarylogs-spreadsheet-data-generator.js'
import { createLinkAndLogin } from '~/test/support/login-helper.js'
import { createPrnDetails } from '~/test/support/fixtures.js'
import { PrnHelper } from '~/test/support/prn.helper.js'
import { generateNumbers } from '~/test/support/reg-acc-number.js'
import { checkWasteBalanceForWindow } from '~/test/support/waste-balance-mode.js'
import { isDecemberWasteWindowOpen } from '~/test/support/december-waste-window.js'
import { checkOnUploadPage } from '~/test/support/summary-log-checks.js'

const JOURNEY_TIMEOUT_MS = 4 * 60 * 1000
const OPENING_BALANCE_2026 = '1,000.00'

const exportedTonnes = (tonnage) => ({
  'Exported (sections 1, 2 and 3)': [
    {
      fields: {
        WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE: 'No',
        DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE: 'No',
        WAS_THE_WASTE_REFUSED: 'No',
        WAS_THE_WASTE_STOPPED: 'No',
        OSR_ID: 100,
        TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: tonnage
      }
    }
  ]
})

test.describe('Accredited exporter waste balance across years @multiYearWasteBalance', () => {
  test("Each year keeps its own waste balance and a PERN draws on its own year's balance", async ({
    page
  }) => {
    test.setTimeout(JOURNEY_TIMEOUT_MS)

    const dashboardPage = new DashboardPage(page)
    const chooseYearPage = new ChooseYearPage(page)
    const wasteRecordsPage = new WasteRecordsPage(page)
    const uploadSummaryLogPage = new UploadSummaryLogPage(page)
    const createPRNPage = new CreatePRNPage(page)
    const prnCreatedPage = new PRNCreatedPage(page)
    const prnHelper = new PrnHelper(page, true)

    const numbering = /** @type {const} */ ({
      wasteProcessingType: 'exporter',
      materialSuffix: 'WO'
    })
    const { regNumber, accNumber: accNumber2026 } = generateNumbers(numbering)
    const organisationDetails = await createLinkedOrganisation([
      { material: 'Wood (R3)', wasteProcessingType: 'Exporter' }
    ])
    const { email } = await updateMigratedOrganisation(
      organisationDetails.refNo,
      [{ regNumber, accNumber: accNumber2026, status: 'approved' }],
      undefined,
      '2026-01-01'
    )
    await seedOverseasSites(organisationDetails.refNo)
    const { accreditationNumber: accNumber2027 } =
      await seedExternalAccreditation(
        {
          organisationNumber: organisationDetails.orgId,
          registrationNumber: regNumber
        },
        2027,
        numbering
      )

    const summaryLogFor = (year, accNumber, tonnage) =>
      generateSpreadsheetData({
        wasteProcessingType: 'exporter',
        materialSuffix: 'WO',
        regNumber,
        accNumber,
        rows: exportedTonnes(tonnage),
        year,
        silentLogging: true
      })
    const log2026 = await summaryLogFor(2026, accNumber2026, 1000)
    const log2027 = await summaryLogDatedAt(
      await summaryLogFor(2027, accNumber2027, 400),
      new Date(Date.UTC(2027, 0, 1, 12))
    )

    const openAccreditationFor = async (year) => {
      await dashboardPage.chooseDifferentYearLink().click()
      await chooseYearPage.yearOption(year).check()
      await chooseYearPage.continueButton().click()
      await dashboardPage.expectYear(year)
      await dashboardPage.selectTableLink(1, 1)
      await wasteRecordsPage.expectYear(year)
    }

    const expectWasteBalances = async (balances) => {
      for (const [year, balance] of Object.entries(balances)) {
        await openAccreditationFor(Number(year))
        expect(
          await wasteRecordsPage.wasteBalanceAmount(),
          `${year} waste balance`
        ).toBe(balance)
      }
    }

    const createPern = async ({
      year,
      accNumber,
      balance,
      tonnageWordings
    }) => {
      await openAccreditationFor(year)
      await wasteRecordsPage.createNewPERNLink().click()
      const wasteBalancePool = await checkWasteBalanceForWindow(
        createPRNPage,
        isDecemberWasteWindowOpen(),
        balance,
        'PERNs'
      )
      await prnHelper.createAndCheckPrnDetails(
        createPrnDetails({
          materialDesc: 'Wood',
          accNumber,
          organisationDetails,
          tonnageWordings,
          wasteBalancePool
        })
      )
      await prnCreatedPage.returnToRegistrationPage().click()
    }

    await createLinkAndLogin(page, organisationDetails.refNo, email)

    for (const { year, log } of [
      { year: 2026, log: log2026 },
      { year: 2027, log: log2027 }
    ]) {
      await openAccreditationFor(year)
      await wasteRecordsPage.submitSummaryLogLink().click()
      await checkOnUploadPage(page, year)
      await uploadSummaryLogPage.performUploadAndReturnToHomepage(log, year)
    }

    await expectWasteBalances({ 2026: OPENING_BALANCE_2026, 2027: '400.00' })

    await createPern({
      year: 2027,
      accNumber: accNumber2027,
      balance: '400.00',
      tonnageWordings: { integer: 40, word: 'Forty' }
    })
    await expectWasteBalances({ 2027: '360.00', 2026: OPENING_BALANCE_2026 })

    await createPern({
      year: 2026,
      accNumber: accNumber2026,
      balance: OPENING_BALANCE_2026,
      tonnageWordings: { integer: 100, word: 'One hundred' }
    })
    await expectWasteBalances({ 2026: '900.00', 2027: '360.00' })
  })
})
