import { test, expect } from '@playwright/test'

import { AdminLoginPage } from 'page-objects/admin/login.page'
import { Navigation } from 'page-objects/admin/navigation.page'
import { OrganisationsPage } from 'page-objects/admin/organisations.page'
import { OrganisationOverviewPage } from 'page-objects/admin/organisation.overview.page'
import { RegistrationOverviewPage } from 'page-objects/admin/registration.overview.page'
import { JsonEditor } from 'page-objects/admin/jsoneditor.page'
import {
  createLinkedOrganisation,
  createSubmittedReport,
  FAKE_ACCREDITATION_NUMBER,
  FAKE_REGISTRATION_NUMBER,
  updateMigratedOrganisation
} from '../../support/organisation-seeding.js'
import { SystemLogsPage } from 'page-objects/admin/system.logs.page'
import { UnsubmitConfirmationPage } from 'page-objects/admin/unsubmit.confirmation.page'
import { randomUUID } from 'crypto'

// The Reg/Acc Numbers column shows one 'registration - accreditation' line per
// registration, joined by <br> - which innerText() reads back as a newline. A
// freshly applied organisation has a number on neither side of either line.
const UNNUMBERED_REG_ACC_PAIRS = 'None - None\nNone - None'

test.describe('Organisations page', () => {
  // Each test logs in independently (Playwright gives every test a fresh,
  // isolated browser context - unlike WDIO's single shared session per file,
  // login state doesn't carry over between tests).
  test.beforeEach(async ({ page }) => {
    const loginPage = new AdminLoginPage(page)
    await loginPage.loginAsServiceMaintainer()
  })

  test('Should be able to update an organisation and view system logs @organisations', async ({
    page
  }) => {
    const navigation = new Navigation(page)
    const organisationsPage = new OrganisationsPage(page)
    const jsonEditor = new JsonEditor(page)
    const systemLogsPage = new SystemLogsPage(page)

    const linkedOrganisation = await createLinkedOrganisation([
      { material: 'Paper or board (R3)', wasteProcessingType: 'Reprocessor' },
      { material: 'Paper or board (R3)', wasteProcessingType: 'Exporter' }
    ])

    const organisation = linkedOrganisation.organisation

    await navigation.clickOnLink('Organisations')

    await organisationsPage.searchFor(organisation.companyName)
    const searchResult = await organisationsPage.searchResult()
    expect(searchResult).toEqual('1 result found')

    const searchOrgTable = await organisationsPage.getTableData()
    const expectedSearchOrgTable = [
      {
        header: organisation.companyName,
        orgId: `${linkedOrganisation.orgId}`,
        regAccNumbers: UNNUMBERED_REG_ACC_PAIRS,
        regulator: 'EA',
        status: 'created'
      }
    ]
    expect(searchOrgTable).toEqual(expectedSearchOrgTable)

    const updatedOrgId = linkedOrganisation.orgId + 100000

    await organisationsPage.editLink(1)

    await jsonEditor.switchToTextEditor()
    const actualOrgValue = await jsonEditor.getEditorTextValue()
    expect(actualOrgValue).toContain(organisation.email)
    await jsonEditor.switchToTreeEditor()
    await jsonEditor.updateOrgId(updatedOrgId)
    await jsonEditor.saveChanges()

    const successMessage = await organisationsPage.getSuccessMessage()
    expect(successMessage).toEqual('Organisation record updated')

    await navigation.clickOnLink('Organisations')

    await organisationsPage.searchFor(organisation.companyName)
    const updatedSearchResult = await organisationsPage.searchResult()
    expect(updatedSearchResult).toEqual('1 result found')

    const updatedSearchOrgTable = await organisationsPage.getTableData()
    const expectedUpdatedSearchOrgTable = [
      {
        header: organisation.companyName,
        orgId: `${updatedOrgId}`,
        regAccNumbers: UNNUMBERED_REG_ACC_PAIRS,
        regulator: 'EA',
        status: 'created'
      }
    ]
    expect(updatedSearchOrgTable).toEqual(expectedUpdatedSearchOrgTable)

    await navigation.clickOnLink('System logs')
    await systemLogsPage.searchFor(linkedOrganisation.refNo)
    const searchResults = await systemLogsPage.searchResults()
    await expect(searchResults).toBeAttached()

    const actualJsonDifference = await systemLogsPage.jsonDifference()
    const expectedJsonDifference = {
      version: {
        _changed: '1 -> 2'
      },
      orgId: {
        _changed: `${linkedOrganisation.orgId} -> ${updatedOrgId}`
      },
      users: {
        0: {
          _added: {
            fullName: `${organisation.fullName}`,
            email: `${organisation.email}`,
            roles: ['initial_user', 'standard_user']
          }
        }
      }
    }
    expect(JSON.parse(actualJsonDifference)).toEqual(expectedJsonDifference)
  })

  test('Should be able to view an organisation overview and drill down to a registration overview @organisations', async ({
    page
  }) => {
    const organisationsPage = new OrganisationsPage(page)
    const organisationOverviewPage = new OrganisationOverviewPage(page)
    const registrationOverviewPage = new RegistrationOverviewPage(page)

    const linkedOrganisation = await createLinkedOrganisation([
      { material: 'Paper or board (R3)', wasteProcessingType: 'Reprocessor' },
      { material: 'Paper or board (R3)', wasteProcessingType: 'Exporter' }
    ])

    const { organisation, registrations } = linkedOrganisation

    await organisationsPage.open()

    await organisationsPage.searchFor(organisation.companyName)
    const searchResult = await organisationsPage.searchResult()
    expect(searchResult).toEqual('1 result found')

    const searchOrgTable = await organisationsPage.getTableData()
    const expectedSearchOrgTable = [
      {
        header: organisation.companyName,
        orgId: `${linkedOrganisation.orgId}`,
        regAccNumbers: UNNUMBERED_REG_ACC_PAIRS,
        regulator: 'EA',
        status: 'created'
      }
    ]
    expect(searchOrgTable).toEqual(expectedSearchOrgTable)

    await organisationsPage.viewLink(1)

    // organisation overview page
    const organisationOverviewPageHeader =
      await organisationOverviewPage.getHeaderText()
    expect(organisationOverviewPageHeader).toEqual(organisation.companyName)

    const registrationsData =
      await organisationOverviewPage.getRegistrationsTableData()
    const expectedRegistrationsData = [
      {
        registrationNumber: '',
        registrationStatus: 'created',
        processingType: 'reprocessor',
        material: 'paper',
        site: registrations[0].streetAddress,
        accreditationNumber: '',
        accreditationStatus: 'created'
      },
      {
        registrationNumber: '',
        registrationStatus: 'created',
        processingType: 'exporter',
        material: 'paper',
        site: '',
        accreditationNumber: '',
        accreditationStatus: 'created'
      }
    ]
    expect(registrationsData).toEqual(expectedRegistrationsData)

    await organisationOverviewPage.viewRegistrationLink(1)

    // registration overview page
    const registrationOverviewPageHeader =
      await registrationOverviewPage.getHeaderText()
    const registrationOverviewHeaderRegex = new RegExp(
      `^${organisation.companyName} - \\w+$` // Header is company name following by registration number or (dynamic) registration id (when no registration number has been assigned)
    )
    expect(registrationOverviewPageHeader).toMatch(
      registrationOverviewHeaderRegex
    )

    const reportsData = await registrationOverviewPage.getReportsTableData()
    expect(reportsData.length).toBeGreaterThanOrEqual(1)

    const summaryLogContent =
      await registrationOverviewPage.getSummaryLogsContent()
    expect(summaryLogContent).toContain('No summary logs')
  })

  test('Should be able to view an organisation overview and unsubmit a report @organisations @unsubmit', async ({
    page
  }) => {
    const organisationsPage = new OrganisationsPage(page)
    const organisationOverviewPage = new OrganisationOverviewPage(page)
    const registrationOverviewPage = new RegistrationOverviewPage(page)
    const unsubmitConfirmationPage = new UnsubmitConfirmationPage(page)

    const linkedOrganisation = await createLinkedOrganisation([
      { material: 'Paper or board (R3)', wasteProcessingType: 'Reprocessor' }
    ])

    await updateMigratedOrganisation(linkedOrganisation.refNo, [
      {
        regNumber: FAKE_REGISTRATION_NUMBER,
        accNumber: FAKE_ACCREDITATION_NUMBER,
        status: 'approved',
        reprocessingType: 'input'
      }
    ])

    const { organisation } = linkedOrganisation

    await createSubmittedReport(linkedOrganisation.refNo)

    await organisationsPage.open()

    await organisationsPage.searchFor(organisation.companyName)
    const searchResult = await organisationsPage.searchResult()
    expect(searchResult).toEqual('1 result found')

    const searchOrgTable = await organisationsPage.getTableData()
    const expectedSearchOrgTable = [
      {
        header: organisation.companyName,
        orgId: `${linkedOrganisation.orgId}`,
        regAccNumbers: `${FAKE_REGISTRATION_NUMBER} - ${FAKE_ACCREDITATION_NUMBER}`,
        regulator: 'EA',
        status: 'active'
      }
    ]
    expect(searchOrgTable).toEqual(expectedSearchOrgTable)

    await organisationsPage.viewLink(1)

    // organisation overview page
    const organisationOverviewPageHeader =
      await organisationOverviewPage.getHeaderText()
    expect(organisationOverviewPageHeader).toEqual(organisation.companyName)

    await organisationOverviewPage.viewRegistrationLink(1)

    let reportsData = await registrationOverviewPage.getReportsTableData()
    const lastRowIdx = reportsData.length - 1
    expect(reportsData.length).toBeGreaterThanOrEqual(1)
    expect(reportsData[lastRowIdx].status).toEqual('Submitted')
    expect(reportsData[lastRowIdx].actions).toContain('View')
    expect(reportsData[lastRowIdx].actions).toContain('Unsubmit')

    // unsubmit report
    await registrationOverviewPage.clickOnUnsubmitReportLink(lastRowIdx + 1)
    const warningText = await unsubmitConfirmationPage.getWarningText()
    expect(warningText).toContain(
      "Unsubmitting will move the report back to 'ready to submit'. The operator will need to delete and resubmit it."
    )
    await unsubmitConfirmationPage.confirmUnsubmit()

    const successMessage = await unsubmitConfirmationPage.getSuccessMessage()
    expect(successMessage).toEqual('Report unsubmitted')

    await unsubmitConfirmationPage.returnToRegistrationOverview()

    reportsData = await registrationOverviewPage.getReportsTableData()
    expect(reportsData.length).toBeGreaterThanOrEqual(1)
    expect(reportsData[lastRowIdx].status).toEqual('Ready to submit')
    expect(reportsData[lastRowIdx].actions).not.toContain('Unsubmit')
  })

  // Every field addresses the same organisation, so one seeded organisation
  // serves all of them. Its numbers carry a random suffix: the backend matches
  // them whole and case-insensitively, so organisations left behind by earlier
  // runs would otherwise share a fixed number and turn a single result into
  // several.
  test.describe('Searching by each field', () => {
    /**
     * @type {{
     *   companyName: string,
     *   orgId: string,
     *   refNo: string,
     *   registrationNumber: string,
     *   accreditationNumber: string,
     *   registrationId: string,
     *   accreditationId: string
     * }}
     */
    let seeded

    test.beforeAll(async () => {
      const linkedOrganisation = await createLinkedOrganisation([
        { material: 'Paper or board (R3)', wasteProcessingType: 'Reprocessor' }
      ])

      const unique = randomUUID()
      const registrationNumber = `FAKE/REG/${unique}`
      const accreditationNumber = `FAKE/ACC/${unique}`

      // Assigning the numbers also links the accreditation to the
      // registration, so the two ids below belong to the same pair.
      const migrated = await updateMigratedOrganisation(
        linkedOrganisation.refNo,
        [
          {
            regNumber: registrationNumber,
            accNumber: accreditationNumber,
            status: 'approved',
            reprocessingType: 'input'
          }
        ]
      )

      seeded = {
        companyName: linkedOrganisation.organisation.companyName,
        orgId: `${linkedOrganisation.orgId}`,
        refNo: linkedOrganisation.refNo,
        registrationNumber,
        accreditationNumber,
        registrationId: migrated.registrationIds[0],
        accreditationId: migrated.accreditationIds[0]
      }
    })

    test.beforeEach(async ({ page }) => {
      const organisationsPage = new OrganisationsPage(page)
      await organisationsPage.open()
    })

    async function expectOnlySeededOrganisation(organisationsPage) {
      expect(await organisationsPage.searchResult()).toEqual('1 result found')
      expect(await organisationsPage.getTableData()).toEqual([
        {
          header: seeded.companyName,
          orgId: seeded.orgId,
          regAccNumbers: `${seeded.registrationNumber} - ${seeded.accreditationNumber}`,
          regulator: 'EA',
          // Approved rather than active: the organisation is never linked to a
          // Defra ID, which is what makes an approved organisation active.
          status: 'approved'
        }
      ])
    }

    test('Should find an organisation by its organisation ID @organisations', async ({
      page
    }) => {
      const organisationsPage = new OrganisationsPage(page)

      await organisationsPage.searchBy({ orgId: seeded.orgId })

      await expectOnlySeededOrganisation(organisationsPage)
    })

    test('Should find an organisation by its reference number @organisations', async ({
      page
    }) => {
      const organisationsPage = new OrganisationsPage(page)

      await organisationsPage.searchBy({ orgId: seeded.refNo })

      await expectOnlySeededOrganisation(organisationsPage)
    })

    test('Should find an organisation by registration number @organisations', async ({
      page
    }) => {
      const organisationsPage = new OrganisationsPage(page)

      await organisationsPage.searchBy({
        registrationNumber: seeded.registrationNumber
      })

      await expectOnlySeededOrganisation(organisationsPage)
    })

    test('Should find an organisation by registration ID @organisations', async ({
      page
    }) => {
      const organisationsPage = new OrganisationsPage(page)

      await organisationsPage.searchBy({
        registrationId: seeded.registrationId
      })

      await expectOnlySeededOrganisation(organisationsPage)
    })

    test('Should find an organisation by accreditation number @organisations', async ({
      page
    }) => {
      const organisationsPage = new OrganisationsPage(page)

      await organisationsPage.searchBy({
        accreditationNumber: seeded.accreditationNumber
      })

      await expectOnlySeededOrganisation(organisationsPage)
    })

    test('Should find an organisation by accreditation ID @organisations', async ({
      page
    }) => {
      const organisationsPage = new OrganisationsPage(page)

      await organisationsPage.searchBy({
        accreditationId: seeded.accreditationId
      })

      await expectOnlySeededOrganisation(organisationsPage)
    })

    test('Should find nothing when only some of the search fields match @organisations', async ({
      page
    }) => {
      const organisationsPage = new OrganisationsPage(page)

      await organisationsPage.searchBy({
        registrationNumber: seeded.registrationNumber,
        accreditationNumber: `FAKE/ACC/${randomUUID()}`
      })

      expect(await organisationsPage.searchResult()).toEqual('0 results found')
    })

    test('Should empty every search field and show all organisations when the search is cleared @organisations', async ({
      page
    }) => {
      const organisationsPage = new OrganisationsPage(page)

      await organisationsPage.searchBy({ orgId: seeded.orgId })
      expect(await organisationsPage.searchResult()).toEqual('1 result found')

      await organisationsPage.clearSearch()

      expect(await organisationsPage.searchFieldValues()).toEqual({
        search: '',
        orgId: '',
        registrationNumber: '',
        registrationId: '',
        accreditationNumber: '',
        accreditationId: ''
      })
      expect(await organisationsPage.searchResultExists()).toBe(false)
      expect(await organisationsPage.getTableRowCount()).toBeGreaterThan(1)
    })
  })
})
