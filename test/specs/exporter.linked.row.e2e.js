import { test, expect } from '@playwright/test'
import { CheckSummaryLogPage } from 'page-objects/check.summary.log.page.js'
import { UploadSummaryLogPage } from 'page-objects/upload.summary.log.page.js'
import { WasteRecordsPage } from 'page-objects/waste.records.page.js'
import {
  seedAccreditedInConsecutiveYears,
  seedOverseasSites
} from '~/test/support/seeding/organisation.js'
import {
  generateSpreadsheetData,
  untouchedTemplateRow
} from '~/test/support/spreadsheet/summarylogs-spreadsheet-data-generator.js'
import { createLinkAndLogin } from '~/test/support/login-helper.js'
import { openAccreditationFor } from '~/test/support/accreditation-navigation.js'
import { formatTonnage } from '~/test/support/tonnage.js'
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
const LINKED_ROW_ID = 1001
const EXPORTED_IN_DECEMBER_ROW_ID = 1002
const EXPORTED_IN_DECEMBER_TONNAGE = 50
const LINKED_TO_EXPORTED_ROW_ID = 1003
const CREDITED_TO_LATER = DECEMBER_LOAD_TONNAGE + EXPORTED_IN_DECEMBER_TONNAGE

const DECEMBER_LOAD_WEIGHTS = {
  GROSS_WEIGHT: 400,
  TARE_WEIGHT: 5,
  PALLET_WEIGHT: 5,
  WEIGHT_OF_NON_TARGET_MATERIALS: 10,
  RECYCLABLE_PROPORTION_PERCENTAGE: 0.8,
  BAILING_WIRE_PROTOCOL: 'No'
}

const receivedInDecemberNotYetExported = {
  rowId: DECEMBER_LOAD_ROW_ID,
  fields: {
    DATE_RECEIVED_FOR_EXPORT: `15/12/${EARLIER}`,
    ...DECEMBER_LOAD_WEIGHTS,
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

const exportedInDecemberNotYetReceivedOverseas = {
  rowId: EXPORTED_IN_DECEMBER_ROW_ID,
  fields: {
    ...receivedInDecemberNotYetExported.fields,
    TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: EXPORTED_IN_DECEMBER_TONNAGE,
    DATE_OF_EXPORT: `28/12/${EARLIER}`
  }
}

const untouchedExportedRow = () =>
  untouchedTemplateRow('exporter', EXPORTED, LATER)

const linkedToDecemberLoad = async () => ({
  rowId: LINKED_ROW_ID,
  fields: {
    ...(await untouchedExportedRow()),
    PREVIOUS_YEAR_ROW_ID: DECEMBER_LOAD_ROW_ID,
    DATE_OF_EXPORT: `05/01/${LATER}`,
    DATE_RECEIVED_BY_OSR: `20/01/${LATER}`
  }
})

const linkedToDecemberExport = async () => ({
  rowId: LINKED_TO_EXPORTED_ROW_ID,
  fields: {
    ...(await untouchedExportedRow()),
    PREVIOUS_YEAR_ROW_ID: EXPORTED_IN_DECEMBER_ROW_ID,
    DATE_RECEIVED_BY_OSR: `06/01/${LATER}`
  }
})

test.describe('Accredited exporter load linked across years @multiYearWasteBalance', () => {
  test('2027 rows linked to December 2026 loads, received or already exported, credit their tonnage to 2027 and leave 2026 unchanged', async ({
    page
  }) => {
    test.setTimeout(JOURNEY_TIMEOUT_MS)

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

    const summaryLogFor = (year, rows) =>
      generateSpreadsheetData({
        ...numbering,
        regNumber,
        accNumber: accNumbers[year],
        rows: { [EXPORTED]: rows },
        year,
        silentLogging: true
      })

    const openAccreditation = (year) =>
      openAccreditationFor(page, organisationDetails.refNo, year)

    const expectWasteBalance = async (year, balance) => {
      await openAccreditation(year)
      expect(
        await wasteRecordsPage.wasteBalanceAmount(),
        `${year} waste balance`
      ).toBe(formatTonnage(balance))
    }

    await createLinkAndLogin(page, organisationDetails.refNo, email)

    await openAccreditation(EARLIER)
    await wasteRecordsPage.submitSummaryLogLink().click()
    await checkOnUploadPage(page, EARLIER)
    await uploadSummaryLogPage.performUploadAndReturnToHomepage(
      await summaryLogFor(EARLIER, [
        receivedInDecemberNotYetExported,
        exportedInDecemberNotYetReceivedOverseas
      ]),
      EARLIER
    )
    await expectWasteBalance(EARLIER, 0)

    await openAccreditation(LATER)
    await wasteRecordsPage.submitSummaryLogLink().click()
    await checkOnUploadPage(page, LATER)
    await uploadSummaryLogPage.uploadFile(
      await summaryLogFor(LATER, [
        await linkedToDecemberLoad(),
        await linkedToDecemberExport()
      ])
    )
    await uploadSummaryLogPage.continue()

    await checkBodyText(page, 'Your summary log is being checked', 30)
    await checkOnCheckPage(page, LATER)
    await checkBodyText(page, 'Open periods: new loads', 30)
    expect(
      (await checkSummaryLogPage.allSubStateHeadings()).join(' | ')
    ).toContain(
      '2 new loads will be recorded (and will add to your waste balance)'
    )
    await checkBodyText(
      page,
      `The new loads will add ${formatTonnage(CREDITED_TO_LATER)} tonnes to your waste balance.`,
      10
    )

    await checkSummaryLogPage.uploadButton().click()
    await checkBodyText(page, 'Your waste records are being updated', 30)
    await uploadSummaryLogPage.checkUploaded(LATER)
    await uploadSummaryLogPage.returnToHomePageLink().click()

    await expectWasteBalance(LATER, CREDITED_TO_LATER)
    await expectWasteBalance(EARLIER, 0)
  })
})
