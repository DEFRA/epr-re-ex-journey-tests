import {
  createLinkedOrganisation,
  createSubmittedReport,
  updateMigratedOrganisation
} from '~/test/support/apicalls.js'
import OrganisationsPage from 'page-objects/admin/organisations.page'
import { expect } from '@wdio/globals'
import HomePage from 'page-objects/admin/home.page'
import Navigation from 'page-objects/admin/navigation.page'
import LoginPage from 'page-objects/admin/login.page'
import JsonEditor from 'page-objects/admin/jsoneditor.page'
import OrsUploadPage from 'page-objects/admin/ors.upload.page'
import OrganisationOverviewPage from 'page-objects/admin/organisation.overview.page'
import RegistrationOverviewPage from 'page-objects/admin/registration.overview.page'
import { purgeDlq, sendMessageToDlq } from '~/test/support/sqs-helpers.js'
import QueueManagementPage from 'page-objects/admin/queue.management.page'

const users = [
  {
    username: 'niea@test.gov.uk',
    scopes: ['admin.read', 'admin.dlq.purge']
  },
  { username: 'nrw@test.gov.uk', scopes: ['admin.read'] }
]

users.forEach(({ username, scopes }) => {
  describe(`Permissions flow for a user with the following scopes ${scopes}`, () => {
    beforeEach(async () => {
      await LoginPage.loginAsServiceMaintainer(username)
    })

    afterEach(async () => {
      await HomePage.signOut()
    })

    it('Should not be able to update an organisation @permissions @organisationpermissions', async () => {
      const linkedOrganisation = await createLinkedOrganisation([
        { material: 'Paper or board (R3)', wasteProcessingType: 'Reprocessor' }
      ])

      const organisation = linkedOrganisation.organisation

      await Navigation.clickOnLink('Organisations')

      await OrganisationsPage.searchFor(organisation.companyName)
      const searchResult = await OrganisationsPage.searchResult()
      expect(searchResult).toEqual('1 result found')

      await OrganisationsPage.editLink(1)

      const permissionsText = await OrganisationsPage.getPermissionText()
      expect(permissionsText).toContain(
        'You do not have permission to edit this organisation.'
      )

      const saveButtonExists = await JsonEditor.saveButtonExists()
      expect(saveButtonExists).toBeFalsy()
    })

    it('Should not be able to upload ORS file @permissions @orspermissions', async () => {
      await Navigation.clickOnLink('Overseas sites')
      await OrsUploadPage.open()

      const permissionsHeader = await OrsUploadPage.permissionsErrorHeading()
      expect(permissionsHeader).toContain('You do not have permission')

      const permissionsText = await OrsUploadPage.permissionsErrorText()
      expect(permissionsText).toContain(
        'Your account does not have permission to use this page. If you think this is wrong, contact your administrator.'
      )
    })

    it('Should not be able to unsubmit a report @permissions @unsubmitpermissions', async () => {
      const linkedOrganisation = await createLinkedOrganisation([
        { material: 'Paper or board (R3)', wasteProcessingType: 'Reprocessor' }
      ])

      const { organisation } = linkedOrganisation

      const registrationNumber = `FAKE/REG123/TEST`
      const accreditationNumber = `FAKE/ACC123/TEST`

      await updateMigratedOrganisation(linkedOrganisation.refNo, [
        {
          regNumber: registrationNumber,
          accNumber: accreditationNumber,
          status: 'approved',
          reprocessingType: 'input'
        }
      ])

      await createSubmittedReport(linkedOrganisation.refNo)

      await OrganisationsPage.open()
      await OrganisationsPage.searchFor(organisation.companyName)
      await OrganisationsPage.viewLink(1)

      await OrganisationOverviewPage.viewRegistrationLink(1)

      const unsubmitLinkExists =
        await RegistrationOverviewPage.unsubmitReportLinkExists(1)
      expect(unsubmitLinkExists).toBeFalsy()
    })
  })
})

describe('Permissions flow for a support user only', () => {
  beforeEach(async () => {
    await LoginPage.loginAsServiceMaintainer('nrw@test.gov.uk')
  })

  afterEach(async () => {
    await HomePage.signOut()
  })

  const testMessage = {
    type: 'PROCESS_SUMMARY_LOG',
    payload: {
      summaryLogId: 'journey-test-dlq-001',
      description: 'Journey test DLQ message'
    }
  }

  it('Should not be able to purge the DLQ from the UI @permissions @dlqpermissions', async () => {
    await purgeDlq()
    await sendMessageToDlq(testMessage)

    await Navigation.clickOnLink('Queue management')

    const clearAllMessagesButtonExists =
      await QueueManagementPage.clearAllMessagesButtonExists()
    expect(clearAllMessagesButtonExists).toBeFalsy()
  })
})
