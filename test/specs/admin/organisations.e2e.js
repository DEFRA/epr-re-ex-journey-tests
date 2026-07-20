import { expect } from '@wdio/globals'

import LoginPage from 'page-objects/admin/login.page'
import Navigation from 'page-objects/admin/navigation.page'
import OrganisationsPage from 'page-objects/admin/organisations.page'
import OrganisationOverviewPage from 'page-objects/admin/organisation.overview.page'
import RegistrationOverviewPage from 'page-objects/admin/registration.overview.page'
import JsonEditor from 'page-objects/admin/jsoneditor.page'
import {
  createLinkedOrganisation,
  createSubmittedReport,
  FAKE_ACCREDITATION_NUMBER,
  FAKE_REGISTRATION_NUMBER,
  updateMigratedOrganisation
} from '../../support/apicalls.js'
import SystemLogsPage from 'page-objects/admin/system.logs.page'
import UnsubmitConfirmationPage from 'page-objects/admin/unsubmit.confirmation.page'

describe('Organisations page', () => {
  before(async () => {
    await LoginPage.loginAsServiceMaintainer()
  })

  it('Should be able to update an organisation and view system logs @organisations', async () => {
    const linkedOrganisation = await createLinkedOrganisation([
      { material: 'Paper or board (R3)', wasteProcessingType: 'Reprocessor' },
      { material: 'Paper or board (R3)', wasteProcessingType: 'Exporter' }
    ])

    const organisation = linkedOrganisation.organisation

    await Navigation.clickOnLink('Organisations')

    await OrganisationsPage.searchFor(organisation.companyName)
    const searchResult = await OrganisationsPage.searchResult()
    expect(searchResult).toEqual('1 result found')

    const searchOrgTable = await OrganisationsPage.getTableData()
    const expectedSearchOrgTable = [
      {
        header: organisation.companyName,
        orgId: `${linkedOrganisation.orgId}`,
        regNo: '',
        regulator: 'EA',
        status: 'created'
      }
    ]
    expect(searchOrgTable).toEqual(expectedSearchOrgTable)

    const updatedOrgId = linkedOrganisation.orgId + 100000

    await OrganisationsPage.editLink(1)

    await JsonEditor.switchToTextEditor()
    const actualOrgValue = await JsonEditor.getEditorTextValue()
    expect(actualOrgValue).toContain(organisation.email)
    await JsonEditor.switchToTreeEditor()
    await JsonEditor.updateOrgId(updatedOrgId)
    await JsonEditor.saveChanges()

    const successMessage = await OrganisationsPage.getSuccessMessage()
    expect(successMessage).toEqual('Organisation record updated')

    await Navigation.clickOnLink('Organisations')

    await OrganisationsPage.searchFor(organisation.companyName)
    const updatedSearchResult = await OrganisationsPage.searchResult()
    expect(updatedSearchResult).toEqual('1 result found')

    const updatedSearchOrgTable = await OrganisationsPage.getTableData()
    const expectedUpdatedSearchOrgTable = [
      {
        header: organisation.companyName,
        orgId: `${updatedOrgId}`,
        regNo: '',
        regulator: 'EA',
        status: 'created'
      }
    ]
    expect(updatedSearchOrgTable).toEqual(expectedUpdatedSearchOrgTable)

    await Navigation.clickOnLink('System logs')
    await SystemLogsPage.searchFor(linkedOrganisation.refNo)
    const searchResults = await SystemLogsPage.searchResults()
    await expect(searchResults).toExist()

    const actualJsonDifference = await SystemLogsPage.jsonDifference()
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

  it('Should be able to view an organisation overview and drill down to a registration overview @organisations', async () => {
    const linkedOrganisation = await createLinkedOrganisation([
      { material: 'Paper or board (R3)', wasteProcessingType: 'Reprocessor' },
      { material: 'Paper or board (R3)', wasteProcessingType: 'Exporter' }
    ])

    const { organisation, registrations } = linkedOrganisation

    await OrganisationsPage.open()

    await OrganisationsPage.searchFor(organisation.companyName)
    const searchResult = await OrganisationsPage.searchResult()
    expect(searchResult).toEqual('1 result found')

    const searchOrgTable = await OrganisationsPage.getTableData()
    const expectedSearchOrgTable = [
      {
        header: organisation.companyName,
        orgId: `${linkedOrganisation.orgId}`,
        regNo: '',
        regulator: 'EA',
        status: 'created'
      }
    ]
    expect(searchOrgTable).toEqual(expectedSearchOrgTable)

    await OrganisationsPage.viewLink(1)

    // organisation overview page
    const organisationOverviewPageHeader =
      await OrganisationOverviewPage.getHeaderText()
    expect(organisationOverviewPageHeader).toEqual(organisation.companyName)

    const registrationsData =
      await OrganisationOverviewPage.getRegistrationsTableData()
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

    await OrganisationOverviewPage.viewRegistrationLink(1)

    // registration overview page
    const registrationOverviewPageHeader =
      await RegistrationOverviewPage.getHeaderText()
    const registrationOverviewHeaderRegex = new RegExp(
      `^${organisation.companyName} - \\w+$` // Header is company name following by registration number or (dynamic) registration id (when no registration number has been assigned)
    )
    expect(registrationOverviewPageHeader).toMatch(
      registrationOverviewHeaderRegex
    )

    const reportsData = await RegistrationOverviewPage.getReportsTableData()
    expect(reportsData.length).toBeGreaterThanOrEqual(1)

    const summaryLogContent =
      await RegistrationOverviewPage.getSummaryLogsContent()
    expect(summaryLogContent).toContain('No summary logs')
  })

  it('Should be able to view an organisation overview and unsubmit a report @organisations @unsubmit', async () => {
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

    await OrganisationsPage.open()

    await OrganisationsPage.searchFor(organisation.companyName)
    const searchResult = await OrganisationsPage.searchResult()
    expect(searchResult).toEqual('1 result found')

    const searchOrgTable = await OrganisationsPage.getTableData()
    const expectedSearchOrgTable = [
      {
        header: organisation.companyName,
        orgId: `${linkedOrganisation.orgId}`,
        regNo: '',
        regulator: 'EA',
        status: 'active'
      }
    ]
    expect(searchOrgTable).toEqual(expectedSearchOrgTable)

    await OrganisationsPage.viewLink(1)

    // organisation overview page
    const organisationOverviewPageHeader =
      await OrganisationOverviewPage.getHeaderText()
    expect(organisationOverviewPageHeader).toEqual(organisation.companyName)

    await OrganisationOverviewPage.viewRegistrationLink(1)

    let reportsData = await RegistrationOverviewPage.getReportsTableData()
    const lastRowIdx = reportsData.length - 1
    expect(reportsData.length).toBeGreaterThanOrEqual(1)
    expect(reportsData[lastRowIdx].status).toEqual('submitted')
    expect(reportsData[lastRowIdx].actions).toContain('View')
    expect(reportsData[lastRowIdx].actions).toContain('Unsubmit')

    // unsubmit report
    await RegistrationOverviewPage.clickOnUnsubmitReportLink(lastRowIdx + 1)
    const warningText = await UnsubmitConfirmationPage.getWarningText()
    expect(warningText).toContain(
      "Unsubmitting will move the report back to 'ready to submit'. The operator will need to delete and resubmit it."
    )
    await UnsubmitConfirmationPage.confirmUnsubmit()

    const successMessage = await UnsubmitConfirmationPage.getSuccessMessage()
    expect(successMessage).toEqual('Report unsubmitted')

    await UnsubmitConfirmationPage.returnToRegistrationOverview()

    reportsData = await RegistrationOverviewPage.getReportsTableData()
    expect(reportsData.length).toBeGreaterThanOrEqual(1)
    expect(reportsData[lastRowIdx].status).toEqual('ready_to_submit')
    expect(reportsData[lastRowIdx].actions).not.toContain('Unsubmit')
  })
})
