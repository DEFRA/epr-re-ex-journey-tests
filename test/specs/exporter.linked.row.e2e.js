import { test, expect } from '@playwright/test'
import ExcelJS from 'exceljs'
import { ChooseYearPage } from 'page-objects/choose.year.page.js'
import { CheckSummaryLogPage } from 'page-objects/check.summary.log.page.js'
import { DashboardPage } from 'page-objects/dashboard.page.js'
import { UploadSummaryLogPage } from 'page-objects/upload.summary.log.page.js'
import { WasteRecordsPage } from 'page-objects/waste.records.page.js'
import {
  seedAccreditedInConsecutiveYears,
  seedOverseasSites
} from '~/test/support/seeding/organisation.js'
import {
  fieldColumns,
  generateSpreadsheetData
} from '~/test/support/spreadsheet/summarylogs-spreadsheet-data-generator.js'
import {
  PROCESSING_TYPE_CONFIG,
  templateFileFor
} from '~/test/support/spreadsheet/spreadsheet-config.js'
import { createLinkAndLogin } from '~/test/support/login-helper.js'
import { checkBodyText } from '~/test/support/checks.js'
import {
  checkOnCheckPage,
  checkOnUploadPage
} from '~/test/support/summary-log-checks.js'

const JOURNEY_TIMEOUT_MS = 4 * 60 * 1000
const EARLIER = 2026
const LATER = EARLIER + 1
const EXPORTED = 'Exported (sections 1, 2 and 3)'

const DECEMBER_LOAD_ROW_ID = 1000
const DECEMBER_LOAD_TONNAGE = 250

const tonnes = (amount) =>
  amount.toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })

const receivedInDecemberNotYetExported = {
  rowId: DECEMBER_LOAD_ROW_ID,
  fields: {
    DATE_RECEIVED_FOR_EXPORT: `15/12/${EARLIER}`,
    WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE: 'No',
    TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: DECEMBER_LOAD_TONNAGE,
    DATE_OF_EXPORT: '',
    DATE_RECEIVED_BY_OSR: '',
    OSR_ID: 100,
    DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE: 'No',
    WAS_THE_WASTE_REFUSED: 'No',
    WAS_THE_WASTE_STOPPED: 'No',
    DATE_THE_REFUSED_STOPPED_WASTE_REPATRIATED: ''
  }
}

const exportedTemplateMarkers = async (year) => {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(
    templateFileFor(PROCESSING_TYPE_CONFIG.exporter.templateFile, year)
  )
  return Object.keys(fieldColumns(workbook.getWorksheet(EXPORTED)))
}

// Every other cell left blank, as an operator linking a load would leave it.
const linkedToDecemberLoad = async () => ({
  rowId: DECEMBER_LOAD_ROW_ID,
  fields: {
    ...Object.fromEntries(
      (await exportedTemplateMarkers(LATER))
        .filter((marker) => marker !== 'ROW_ID')
        .map((marker) => [marker, ''])
    ),
    PREVIOUS_YEAR_ROW_ID: DECEMBER_LOAD_ROW_ID,
    DATE_OF_EXPORT: `05/01/${LATER}`,
    DATE_RECEIVED_BY_OSR: `20/01/${LATER}`
  }
})

test.describe('Accredited exporter load linked across years @multiYearWasteBalance', () => {
  test("A 2027 row linked to a 2026 load received for export takes the 2026 load's details and credits 2027", async ({
    page
  }) => {
    test.setTimeout(JOURNEY_TIMEOUT_MS)

    const dashboardPage = new DashboardPage(page)
    const chooseYearPage = new ChooseYearPage(page)
    const wasteRecordsPage = new WasteRecordsPage(page)
    const uploadSummaryLogPage = new UploadSummaryLogPage(page)
    const checkSummaryLogPage = new CheckSummaryLogPage(page)

    const numbering = /** @type {const} */ ({
      wasteProcessingType: 'exporter',
      materialSuffix: 'WO'
    })
    const { organisationDetails, email, regNumber, accNumbers } =
      await seedAccreditedInConsecutiveYears(EARLIER, {
        material: 'Wood (R3)',
        wasteProcessingType: 'Exporter',
        numbering
      })
    await seedOverseasSites(organisationDetails.refNo)

    const summaryLogFor = (year, row) =>
      generateSpreadsheetData({
        wasteProcessingType: 'exporter',
        materialSuffix: 'WO',
        regNumber,
        accNumber: accNumbers[year],
        rows: { [EXPORTED]: [row] },
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

    const expectWasteBalance = async (year, balance) => {
      await openAccreditationFor(year)
      expect(
        await wasteRecordsPage.wasteBalanceAmount(),
        `${year} waste balance`
      ).toBe(tonnes(balance))
    }

    await createLinkAndLogin(page, organisationDetails.refNo, email)

    await openAccreditationFor(EARLIER)
    await wasteRecordsPage.submitSummaryLogLink().click()
    await checkOnUploadPage(page, EARLIER)
    await uploadSummaryLogPage.performUploadAndReturnToHomepage(
      await summaryLogFor(EARLIER, receivedInDecemberNotYetExported),
      EARLIER
    )
    await expectWasteBalance(EARLIER, 0)

    await openAccreditationFor(LATER)
    await wasteRecordsPage.submitSummaryLogLink().click()
    await checkOnUploadPage(page, LATER)
    await uploadSummaryLogPage.uploadFile(
      await summaryLogFor(LATER, await linkedToDecemberLoad())
    )
    await uploadSummaryLogPage.continue()

    await checkBodyText(page, 'Your summary log is being checked', 30)
    await checkOnCheckPage(page, LATER)
    await checkBodyText(page, 'Open periods: new loads', 30)
    expect(
      (await checkSummaryLogPage.allSubStateHeadings()).join(' | ')
    ).toContain(
      '1 new load will be recorded (and will add to your waste balance)'
    )
    await checkBodyText(
      page,
      `The new loads will add ${tonnes(DECEMBER_LOAD_TONNAGE)} tonnes to your waste balance.`,
      10
    )

    await checkSummaryLogPage.uploadButton().click()
    await checkBodyText(page, 'Your waste records are being updated', 30)
    await uploadSummaryLogPage.checkUploaded(LATER)
    await uploadSummaryLogPage.returnToHomePageLink().click()

    await expectWasteBalance(LATER, DECEMBER_LOAD_TONNAGE)
    await expectWasteBalance(EARLIER, 0)
  })
})
