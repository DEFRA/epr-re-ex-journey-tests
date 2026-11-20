import { test, expect } from '@playwright/test'
import { ChooseYearPage } from 'page-objects/choose.year.page.js'
import { CreatePRNPage } from 'page-objects/create.prn.page.js'
import { DashboardPage } from 'page-objects/dashboard.page.js'
import { PRNCreatedPage } from 'page-objects/prn.created.page.js'
import { UploadSummaryLogPage } from 'page-objects/upload.summary.log.page.js'
import { WasteRecordsPage } from 'page-objects/waste.records.page.js'
import {
  seedAccreditedInConsecutiveYears,
  seedOverseasSites
} from '~/test/support/seeding/organisation.js'
import { generateSpreadsheetData } from '~/test/support/spreadsheet/summarylogs-spreadsheet-data-generator.js'
import { createLinkAndLogin } from '~/test/support/login-helper.js'
import { createPrnDetails } from '~/test/support/fixtures.js'
import { PrnHelper } from '~/test/support/prn.helper.js'
import { isRelevantYearOpen } from '~/test/support/date.js'
import { checkWasteBalanceForWindow } from '~/test/support/waste-balance-mode.js'
import { isDecemberWasteWindowOpenFor } from '~/test/support/december-waste-window.js'
import { checkOnUploadPage } from '~/test/support/summary-log-checks.js'

const JOURNEY_TIMEOUT_MS = 4 * 60 * 1000
const FIRST_YEAR = 2026
const YEARS = [FIRST_YEAR, FIRST_YEAR + 1]
const [EARLIER, LATER] = YEARS

const EXPORTS = [
  {
    year: EARLIER,
    tonnage: 1000,
    datedOn: `01/06/${EARLIER}`,
    pern: { integer: 100, word: 'One hundred' }
  },
  {
    year: LATER,
    tonnage: 400,
    datedOn: `01/01/${LATER}`,
    pern: { integer: 40, word: 'Forty' }
  }
]

const tonnes = (amount) =>
  amount.toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })

const exportedTonnes = (tonnage, datedOn) => ({
  'Exported (sections 1, 2 and 3)': [
    {
      fields: {
        WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE: 'No',
        DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE: 'No',
        WAS_THE_WASTE_REFUSED: 'No',
        WAS_THE_WASTE_STOPPED: 'No',
        OSR_ID: 100,
        TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: tonnage,
        ...(datedOn && {
          DATE_RECEIVED_FOR_EXPORT: datedOn,
          DATE_OF_EXPORT: datedOn,
          DATE_RECEIVED_BY_OSR: datedOn,
          DATE_THE_REFUSED_STOPPED_WASTE_REPATRIATED: datedOn
        })
      }
    }
  ]
})

test.describe('Accredited exporter waste balance across years @multiYearWasteBalance', () => {
  test("Each year keeps its own waste balance and a PERN draws on its own year's balance", async ({
    page
  }) => {
    test.setTimeout(JOURNEY_TIMEOUT_MS)
    expect(
      YEARS.some((year) => isRelevantYearOpen(year)),
      `PERNs can no longer be raised for ${EARLIER} or ${LATER}: move FIRST_YEAR on, to a year with summary log templates for it and the next`
    ).toBe(true)

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
    const { organisationDetails, email, regNumber, accNumbers } =
      await seedAccreditedInConsecutiveYears(FIRST_YEAR, {
        material: 'Wood (R3)',
        wasteProcessingType: 'Exporter',
        numbering
      })
    await seedOverseasSites(organisationDetails.refNo)

    const summaryLogFor = ({ year, tonnage, datedOn }) =>
      generateSpreadsheetData({
        wasteProcessingType: 'exporter',
        materialSuffix: 'WO',
        regNumber,
        accNumber: accNumbers[year],
        rows: exportedTonnes(tonnage, datedOn),
        year,
        silentLogging: true
      })

    const openAccreditationFor = async (year) => {
      await dashboardPage.open(organisationDetails.refNo)
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
        ).toBe(tonnes(balance))
      }
    }

    const expectPernRefused = async (year) => {
      await openAccreditationFor(year)
      await wasteRecordsPage.createNewPERNLink().click()
      await expect(page).toHaveURL(
        new RegExp(`/accreditations/${year}/packaging-recycling-notes$`)
      )
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
        isDecemberWasteWindowOpenFor(year),
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

    for (const exported of EXPORTS) {
      const log = await summaryLogFor(exported)
      await openAccreditationFor(exported.year)
      await wasteRecordsPage.submitSummaryLogLink().click()
      await checkOnUploadPage(page, exported.year)
      await uploadSummaryLogPage.performUploadAndReturnToHomepage(
        log,
        exported.year
      )
    }

    const balances = Object.fromEntries(
      EXPORTS.map(({ year, tonnage }) => [year, tonnage])
    )
    await expectWasteBalances(balances)

    for (const { year, pern } of EXPORTS.toReversed()) {
      if (isRelevantYearOpen(year)) {
        await createPern({
          year,
          accNumber: accNumbers[year],
          balance: tonnes(balances[year]),
          tonnageWordings: pern
        })
        balances[year] -= pern.integer
      } else {
        await expectPernRefused(year)
      }
      await expectWasteBalances(balances)
    }
  })
})
