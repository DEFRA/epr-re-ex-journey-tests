import { test, expect } from '@playwright/test'
import { CheckSummaryLogPage } from 'page-objects/check.summary.log.page.js'
import { UploadSummaryLogPage } from 'page-objects/upload.summary.log.page.js'
import { WasteRecordsPage } from 'page-objects/waste.records.page.js'
import {
  createLinkedOrganisation,
  seedOverseasSites,
  updateMigratedOrganisation
} from '~/test/support/seeding/organisation.js'
import { generateRegNumber } from '~/test/support/reg-acc-number.js'
import {
  generateSpreadsheetData,
  untouchedTemplateRow
} from '~/test/support/spreadsheet/summarylogs-spreadsheet-data-generator.js'
import { createLinkAndLogin } from '~/test/support/login-helper.js'
import { openAccreditationFor } from '~/test/support/accreditation-navigation.js'
import {
  checkBodyText,
  checkBodyTextDoesNotInclude
} from '~/test/support/checks.js'
import {
  checkOnCheckPage,
  checkOnUploadPage
} from '~/test/support/summary-log-checks.js'

const JOURNEY_TIMEOUT_MS = 4 * 60 * 1000
const EARLIER = 2026
const LATER = EARLIER + 1
const EXPORTED = 'Exported (sections 2 and 3)'

const DECEMBER_EXPORT_ROW_ID = 2001
const LINKED_ROW_ID = 2002

// Neither refused nor stopped yet: a 2026 load answered 'No' to both has
// reached its overseas reprocessor, and the service refuses a link to it.
const exportedInDecemberOutcomeUnknown = {
  rowId: DECEMBER_EXPORT_ROW_ID,
  fields: {
    TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 9.5,
    DATE_OF_EXPORT: `20/12/${EARLIER}`,
    OSR_ID: 100,
    WAS_THE_WASTE_REFUSED: '',
    WAS_THE_WASTE_STOPPED: '',
    DATE_THE_REFUSED_STOPPED_WASTE_REPATRIATED: ''
  }
}

const refusedAndRepatriatedInJanuary = async () => ({
  rowId: LINKED_ROW_ID,
  fields: {
    ...(await untouchedTemplateRow('regOnlyExporter', EXPORTED, LATER)),
    PREVIOUS_YEAR_ROW_ID: DECEMBER_EXPORT_ROW_ID,
    WAS_THE_WASTE_REFUSED: 'Yes',
    DATE_THE_REFUSED_STOPPED_WASTE_REPATRIATED: `20/01/${LATER}`
  }
})

test.describe('Registered-only exporter load linked across years @registeredOnly @linkedRow', () => {
  test('a 2027 row linked to a December 2026 export, supplying only its refusal and repatriation, is recorded as a new load', async ({
    page
  }) => {
    test.setTimeout(JOURNEY_TIMEOUT_MS)

    const wasteRecordsPage = new WasteRecordsPage(page)
    const uploadSummaryLogPage = new UploadSummaryLogPage(page)
    const checkSummaryLogPage = new CheckSummaryLogPage(page)

    const numbering = /** @type {const} */ ({
      wasteProcessingType: 'exporter',
      materialSuffix: 'PA'
    })
    const regNumber = generateRegNumber(numbering)
    const organisationDetails = await createLinkedOrganisation([
      {
        material: 'Paper or board (R3)',
        wasteProcessingType: 'Exporter',
        withoutAccreditation: true
      }
    ])
    const { email } = await updateMigratedOrganisation(
      organisationDetails.refNo,
      [{ regNumber, status: 'approved', withoutAccreditation: true }],
      undefined,
      `${EARLIER}-01-01`
    )
    await seedOverseasSites(organisationDetails.refNo)

    const summaryLogFor = (year, rows) =>
      generateSpreadsheetData({
        wasteProcessingType: 'regOnlyExporter',
        materialSuffix: numbering.materialSuffix,
        regNumber,
        rows: { [EXPORTED]: rows },
        year,
        silentLogging: true
      })

    const openRegistration = (year) =>
      openAccreditationFor(page, organisationDetails.refNo, year)

    await createLinkAndLogin(page, organisationDetails.refNo, email)

    await openRegistration(EARLIER)
    await wasteRecordsPage.submitSummaryLogLink().click()
    await checkOnUploadPage(page, EARLIER)
    await uploadSummaryLogPage.performUploadAndReturnToHomepage(
      await summaryLogFor(EARLIER, [exportedInDecemberOutcomeUnknown]),
      EARLIER
    )

    await openRegistration(LATER)
    await wasteRecordsPage.submitSummaryLogLink().click()
    await checkOnUploadPage(page, LATER)
    await uploadSummaryLogPage.uploadFile(
      await summaryLogFor(LATER, [await refusedAndRepatriatedInJanuary()])
    )
    await uploadSummaryLogPage.continue()

    await checkBodyText(page, 'Your summary log is being checked', 30)
    await checkOnCheckPage(page, LATER)
    expect(
      (await checkSummaryLogPage.allSubStateHeadings()).join(' | ')
    ).toContain('1 new load will be recorded')
    await checkBodyText(page, 'These have been added to your summary log.', 10)

    await checkSummaryLogPage.uploadButton().click()
    await checkBodyText(page, 'Your waste records are being updated', 30)
    await uploadSummaryLogPage.checkUploaded(LATER)
    await checkBodyTextDoesNotInclude(page, 'Your updated waste balance', 10)
  })
})
