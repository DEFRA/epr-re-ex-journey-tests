import path from 'node:path'
import os from 'node:os'

import { $, browser, expect } from '@wdio/globals'

import LoginPage from 'page-objects/admin/login.page'
import OrsUploadPage from 'page-objects/admin/ors.upload.page'
import {
  createLinkedOrganisation,
  updateMigratedOrganisation
} from '../../support/apicalls.js'
import {
  createOrsSpreadsheet,
  validOrsSites
} from '../../support/ors-spreadsheet.js'
import OrganisationsPage from 'page-objects/admin/organisations.page'
import OrganisationOverviewPage from 'page-objects/admin/organisation.overview.page'
import RegistrationOverviewPage from 'page-objects/admin/registration.overview.page'
import ORSOverviewPage from 'page-objects/admin/ors.overview.page'

async function uploadWorkbookAndWaitForCompletion(workbookPath) {
  await OrsUploadPage.open()
  await expect(browser).toHaveTitle(
    expect.stringContaining('Upload ORS workbooks')
  )

  await OrsUploadPage.expectUploadFormVisible()
  await OrsUploadPage.uploadWorkbook(workbookPath)
  await OrsUploadPage.clickStartUpload()
  await OrsUploadPage.waitForStatusPage()

  return OrsUploadPage.waitForCompletedOrFailedImport()
}

describe('ORS upload flow @orsupload', () => {
  it('Should upload an ORS workbook and show completed import status @smoketest', async () => {
    const { orgId, refNo } = await createLinkedOrganisation([
      { material: 'Paper or board (R3)', wasteProcessingType: 'Exporter' }
    ])

    const registrationNumber = `FAKE/REG${orgId}/TEST`
    const accreditationNumber = `FAKE/ACC${orgId}/TEST`

    await updateMigratedOrganisation(refNo, [
      {
        regNumber: registrationNumber,
        accNumber: accreditationNumber,
        status: 'approved'
      }
    ])

    const workbookPath = path.join(os.tmpdir(), `ors-test-${orgId}.xlsx`)

    await createOrsSpreadsheet(workbookPath, {
      metadata: {
        packagingWasteCategory: 'Paper or board',
        orgId,
        registrationNumber,
        accreditationNumber
      },
      sites: validOrsSites
    })

    await LoginPage.loginAsServiceMaintainer()

    const finalStatus = await uploadWorkbookAndWaitForCompletion(workbookPath)

    expect(finalStatus).toEqual('Import completed')

    const statusSummary = await OrsUploadPage.getStatusSummaryText()
    expect(statusSummary).toContain('Files processed: 1')
    expect(statusSummary).toContain('Successful: 1')
    expect(statusSummary).toContain('Failed: 0')

    const fileResults = await OrsUploadPage.getUploadedFileResults()
    expect(fileResults).toHaveLength(1)
    expect(fileResults[0].fileName).toContain(`ors-test-${orgId}`)
    expect(fileResults[0].result).toEqual('success')

    const viewRecordsLink = await $('a[href="/overseas-sites"]')
    await expect(viewRecordsLink).toBeDisplayed()

    await OrsUploadPage.openList()
    await expect(browser).toHaveTitle(
      expect.stringContaining('Overseas reprocessing sites')
    )
    await OrsUploadPage.expectDownloadCsvVisible()

    const csvDownload = await OrsUploadPage.fetchListCsv()
    expect(csvDownload.status).toEqual(200)
    expect(csvDownload.contentType).toContain('text/csv')
    expect(csvDownload.contentDisposition).toEqual(
      'attachment; filename="overseas-reprocessing-sites.csv"'
    )
    expect(csvDownload.body).toContain(
      'Org ID,Registration Number,Accreditation Number,ORS ID'
    )
    expect(csvDownload.body).toContain(String(orgId))
    expect(csvDownload.body).toContain(registrationNumber)
    expect(csvDownload.body).toContain(accreditationNumber)
    expect(csvDownload.body).toContain('Fake Recycling Co')

    const expectedHeaders = [
      'Org ID',
      'Registration Number',
      'Accreditation Number',
      'ORS ID',
      'Packaging waste category',
      'Destination country',
      'Overseas reprocessor name',
      'Address line 1',
      'Address line 2',
      'City or town',
      'State, province or region',
      'Postcode or similar',
      'Coordinates',
      'Valid from'
    ]

    const actualHeaders = await OrsUploadPage.getListTableHeaders()
    expect(actualHeaders).toEqual(expectedHeaders)

    const rows = await OrsUploadPage.getListTableRows()
    expect(rows.length).toBeGreaterThan(0)

    const uploadedRow = rows.find(
      (row) =>
        row[0] === String(orgId) &&
        row[1] === registrationNumber &&
        row[2] === accreditationNumber &&
        row[3] === '001'
    )
    expect(uploadedRow).toBeDefined()
    if (!uploadedRow) {
      throw new Error('uploadedRow not found')
    }
    expect(uploadedRow).toHaveLength(14)
    expect(uploadedRow[4]).not.toEqual('-')
    expect(uploadedRow.slice(5)).toEqual([
      'Testland',
      'Fake Recycling Co',
      '1 Test Street',
      'Unit 99',
      'Testville',
      'Testshire',
      'TEST 001',
      '0.0000,0.0000',
      '1 January 2025'
    ])

    await OrsUploadPage.openList('page=1&pageSize=2')
    await OrsUploadPage.expectPaginationVisible()

    const pageOneStatus = await OrsUploadPage.getPaginationStatusText()
    expect(pageOneStatus).toContain('Showing page 1 of')

    await OrsUploadPage.clickNextPage()
    await expect(browser).toHaveUrl(
      expect.stringContaining('page=2&pageSize=2')
    )

    const pageTwoStatus = await OrsUploadPage.getPaginationStatusText()
    expect(pageTwoStatus).toContain('Showing page 2 of')

    const pageTwoRows = await OrsUploadPage.getListTableRows()
    expect(pageTwoRows.length).toBeGreaterThan(0)
    expect(pageTwoRows.length).toBeLessThanOrEqual(2)
  })

  describe('Registration number filter @orsupload', () => {
    let alphaRegistrationNumber
    let alphaAccreditationNumber
    let betaRegistrationNumber
    let betaAccreditationNumber
    let organisationName

    it('Should upload workbooks for filter tests', async () => {
      const { orgId, refNo, organisation } = await createLinkedOrganisation([
        { material: 'Paper or board (R3)', wasteProcessingType: 'Exporter' },
        { material: 'Steel (R4)', wasteProcessingType: 'Exporter' }
      ])

      organisationName = organisation.companyName

      alphaRegistrationNumber = `FAKE/REG${orgId}/ALPHA`
      betaRegistrationNumber = `FAKE/REG${orgId}/BETA`
      alphaAccreditationNumber = `FAKE/ACC${orgId}/ALPHA`
      betaAccreditationNumber = `FAKE/ACC${orgId}/BETA`

      await updateMigratedOrganisation(refNo, [
        {
          regNumber: alphaRegistrationNumber,
          accNumber: alphaAccreditationNumber,
          status: 'approved'
        },
        {
          regNumber: betaRegistrationNumber,
          accNumber: betaAccreditationNumber,
          status: 'approved'
        }
      ])

      const alphaWorkbookPath = path.join(
        os.tmpdir(),
        `ors-alpha-${orgId}.xlsx`
      )
      const betaWorkbookPath = path.join(os.tmpdir(), `ors-beta-${orgId}.xlsx`)

      await createOrsSpreadsheet(alphaWorkbookPath, {
        metadata: {
          packagingWasteCategory: 'Paper or board',
          orgId,
          registrationNumber: alphaRegistrationNumber,
          accreditationNumber: alphaAccreditationNumber
        },
        sites: validOrsSites
      })

      await createOrsSpreadsheet(betaWorkbookPath, {
        metadata: {
          packagingWasteCategory: 'Steel',
          orgId,
          registrationNumber: betaRegistrationNumber,
          accreditationNumber: betaAccreditationNumber
        },
        sites: validOrsSites
      })

      await LoginPage.loginAsServiceMaintainer()

      expect(
        await uploadWorkbookAndWaitForCompletion(alphaWorkbookPath)
      ).toEqual('Import completed')
      expect(
        await uploadWorkbookAndWaitForCompletion(betaWorkbookPath)
      ).toEqual('Import completed')
    })

    it('Should filter list by registration number', async () => {
      await OrsUploadPage.openList()
      await OrsUploadPage.filterByRegistrationNumber(alphaRegistrationNumber)
      await expect(browser).toHaveUrl(
        expect.stringContaining(
          `registrationNumber=${encodeURIComponent(alphaRegistrationNumber)}`
        )
      )
      await expect(await OrsUploadPage.getRegistrationNumberFilterValue()).toBe(
        alphaRegistrationNumber
      )

      const filteredRows = await OrsUploadPage.getListTableRows()
      expect(filteredRows.length).toBe(3)
      expect(
        filteredRows.every((row) => row[1] === alphaRegistrationNumber)
      ).toBe(true)
    })

    it('Should clear the registration number filter', async () => {
      await OrsUploadPage.openList()
      await OrsUploadPage.filterByRegistrationNumber(alphaRegistrationNumber)
      await OrsUploadPage.clearRegistrationNumberFilter()
      await expect(browser).not.toHaveUrl(
        expect.stringContaining(
          `registrationNumber=${encodeURIComponent(alphaRegistrationNumber)}`
        )
      )
    })

    it('Should preserve filter through pagination', async () => {
      await OrsUploadPage.openList(
        new URLSearchParams({
          page: '1',
          pageSize: '2',
          registrationNumber: alphaRegistrationNumber
        }).toString()
      )
      await OrsUploadPage.expectPaginationVisible()

      const pageOneStatus = await OrsUploadPage.getPaginationStatusText()
      expect(pageOneStatus).toContain('Showing page 1 of 2')

      const pageOneRows = await OrsUploadPage.getListTableRows()
      expect(pageOneRows).toHaveLength(2)
      expect(
        pageOneRows.every((row) => row[1] === alphaRegistrationNumber)
      ).toBe(true)

      await OrsUploadPage.clickPageNumber(2)
      await expect(browser).toHaveUrl(
        expect.stringContaining(
          new URLSearchParams({
            page: '2',
            pageSize: '2',
            registrationNumber: alphaRegistrationNumber
          }).toString()
        )
      )

      const pageTwoStatus = await OrsUploadPage.getPaginationStatusText()
      expect(pageTwoStatus).toContain('Showing page 2 of 2')

      const pageTwoRows = await OrsUploadPage.getListTableRows()
      expect(pageTwoRows).toHaveLength(1)
      expect(pageTwoRows[0][1]).toEqual(alphaRegistrationNumber)
    })

    it('Should download CSV with active filter', async () => {
      await OrsUploadPage.openList(
        new URLSearchParams({
          page: '1',
          pageSize: '2',
          registrationNumber: alphaRegistrationNumber
        }).toString()
      )
      const filteredCsvDownload = await OrsUploadPage.fetchListCsv()
      expect(filteredCsvDownload.status).toEqual(200)
      expect(filteredCsvDownload.contentType).toContain('text/csv')
      expect(filteredCsvDownload.contentDisposition).toEqual(
        'attachment; filename="overseas-reprocessing-sites.csv"'
      )
      expect(filteredCsvDownload.body).toContain(
        'Org ID,Registration Number,Accreditation Number,ORS ID'
      )
      expect(filteredCsvDownload.body).toContain(alphaRegistrationNumber)
      expect(filteredCsvDownload.body).toContain(betaRegistrationNumber)
    })

    it('Should show empty state for non-matching filter', async () => {
      await OrsUploadPage.openList('registrationNumber=NOT-FOUND')
      expect(await OrsUploadPage.getInsetText()).toContain(
        "No overseas reprocessing site data found matching 'NOT-FOUND'."
      )
    })

    it('Should be able to view ORS data for an organisation', async () => {
      await OrganisationsPage.open()
      await OrganisationsPage.searchFor(organisationName)
      await OrganisationsPage.viewLink(1)
      await OrganisationOverviewPage.viewRegistrationLink(1)
      await RegistrationOverviewPage.clickOnViewORSLink()
      let orsOverviewHeader = await ORSOverviewPage.getHeaderText()
      expect(orsOverviewHeader).toContain(
        organisationName + ' - ' + alphaAccreditationNumber
      )
      let actualOrsTableData = await ORSOverviewPage.getORSTableData()
      const expectedOrsTableData = [
        {
          orsId: '001',
          packagingWasteCategory: 'paper',
          destinationCountry: 'Testland',
          overseasReprocessorName: 'Fake Recycling Co',
          addressLine1: '1 Test Street',
          addressLine2: 'Unit 99',
          cityOrTown: 'Testville',
          stateProvinceOrRegion: 'Testshire',
          postcode: 'TEST 001',
          coordinates: '0.0000,0.0000',
          validFrom: '1 January 2025'
        },
        {
          orsId: '002',
          packagingWasteCategory: 'paper',
          destinationCountry: 'Fakestan',
          overseasReprocessorName: 'Bogus Paper Mills',
          addressLine1: '42 Nonsense Avenue',
          addressLine2: '-',
          cityOrTown: 'Faketown',
          stateProvinceOrRegion: 'Nowhere',
          postcode: 'FAKE 002',
          coordinates: '1.0000,1.0000',
          validFrom: '1 January 2025'
        },
        {
          orsId: '003',
          packagingWasteCategory: 'paper',
          destinationCountry: 'Madeupistan',
          overseasReprocessorName: 'Imaginary Exports Ltd',
          addressLine1: '999 Fiction Road',
          addressLine2: 'Floor 0',
          cityOrTown: 'Inventedburg',
          stateProvinceOrRegion: 'Neverland',
          postcode: 'NOPE 003',
          coordinates: '2.0000,2.0000',
          validFrom: '1 January 2025'
        }
      ]
      expect(actualOrsTableData).toEqual(expectedOrsTableData)

      // Return to Organisation Overview Page
      ORSOverviewPage.clickOnBreadcrumbLink(2)
      await OrganisationOverviewPage.viewRegistrationLink(2)

      await RegistrationOverviewPage.clickOnViewORSLink()
      orsOverviewHeader = await ORSOverviewPage.getHeaderText()
      expect(orsOverviewHeader).toContain(
        organisationName + ' - ' + betaAccreditationNumber
      )

      const expectedSecondOrsTableData = [
        {
          orsId: '001',
          packagingWasteCategory: 'steel',
          destinationCountry: 'Testland',
          overseasReprocessorName: 'Fake Recycling Co',
          addressLine1: '1 Test Street',
          addressLine2: 'Unit 99',
          cityOrTown: 'Testville',
          stateProvinceOrRegion: 'Testshire',
          postcode: 'TEST 001',
          coordinates: '0.0000,0.0000',
          validFrom: '1 January 2025'
        },
        {
          orsId: '002',
          packagingWasteCategory: 'steel',
          destinationCountry: 'Fakestan',
          overseasReprocessorName: 'Bogus Paper Mills',
          addressLine1: '42 Nonsense Avenue',
          addressLine2: '-',
          cityOrTown: 'Faketown',
          stateProvinceOrRegion: 'Nowhere',
          postcode: 'FAKE 002',
          coordinates: '1.0000,1.0000',
          validFrom: '1 January 2025'
        },
        {
          orsId: '003',
          packagingWasteCategory: 'steel',
          destinationCountry: 'Madeupistan',
          overseasReprocessorName: 'Imaginary Exports Ltd',
          addressLine1: '999 Fiction Road',
          addressLine2: 'Floor 0',
          cityOrTown: 'Inventedburg',
          stateProvinceOrRegion: 'Neverland',
          postcode: 'NOPE 003',
          coordinates: '2.0000,2.0000',
          validFrom: '1 January 2025'
        }
      ]

      actualOrsTableData = await ORSOverviewPage.getORSTableData()
      expect(actualOrsTableData).toEqual(expectedSecondOrsTableData)
    })
  })
})
