import { browser, expect } from '@wdio/globals'

import LoginPage from 'page-objects/admin/login.page'
import OrganisationsPage from 'page-objects/admin/organisations.page'
import OrganisationOverviewPage from 'page-objects/admin/organisation.overview.page'
import UnlinkOrganisationConfirmationPage from 'page-objects/admin/unlink.organisation.confirmation.page'
import SystemLogsPage from 'page-objects/admin/system.logs.page'
import {
  createLinkedOrganisation,
  getOrganisation,
  linkOrganisationToDefraId,
  updateMigratedOrganisation
} from '../../support/apicalls.js'

describe('Unlink organisation from Defra ID', () => {
  before(async () => {
    await browser.deleteCookies()
    await LoginPage.open()
    await LoginPage.enterCredentials('ea@test.gov.uk', 'pass')
    await LoginPage.submitCredentials()
  })

  it('shows the linked Defra ID org, unlinks via the confirm page, and records a system log @organisations @unlink', async () => {
    const linkedOrganisation = await createLinkedOrganisation([
      { material: 'Paper or board (R3)', wasteProcessingType: 'Reprocessor' }
    ])
    const { organisation, refNo } = linkedOrganisation
    const registrationNumber = `FAKE/REG123/TEST`
    const accreditationNumber = `FAKE/ACC123/TEST`

    await updateMigratedOrganisation(refNo, [
      {
        regNumber: registrationNumber,
        accNumber: accreditationNumber,
        status: 'approved',
        reprocessingType: 'input'
      }
    ])
    const defraOrg = await linkOrganisationToDefraId(refNo, organisation.email)

    await OrganisationsPage.open()
    await OrganisationsPage.searchFor(organisation.companyName)
    expect(await OrganisationsPage.searchResult()).toEqual('1 result found')
    await OrganisationsPage.viewLink(1)
    expect(await OrganisationOverviewPage.getHeaderText()).toEqual(
      organisation.companyName
    )

    const linkText = await OrganisationOverviewPage.getDefraIdLinkText()
    expect(linkText).toContain(defraOrg.defraOrgName)
    expect(linkText).toContain(defraOrg.defraOrgId)

    const statusBeforeUnlink = (await getOrganisation(refNo)).status

    expect(await OrganisationOverviewPage.isUnlinkButtonDisplayed()).toBe(true)
    await OrganisationOverviewPage.clickUnlink()

    expect(await UnlinkOrganisationConfirmationPage.getHeaderText()).toEqual(
      'Unlink organisation from Defra ID'
    )
    const bodyText = await UnlinkOrganisationConfirmationPage.getBodyText()
    expect(bodyText).toContain(organisation.companyName)
    expect(bodyText).toContain(defraOrg.defraOrgName)

    await UnlinkOrganisationConfirmationPage.confirmUnlink()

    expect(
      await OrganisationOverviewPage.getNotificationBannerText()
    ).toContain('Organisation unlinked from Defra ID')
    expect(
      await OrganisationOverviewPage.getNoLinkedOrganisationText()
    ).toContain('No linked organisation')

    const orgAfterUnlink = await getOrganisation(refNo)
    expect(orgAfterUnlink.linkedDefraOrganisation).toBeFalsy()
    expect(orgAfterUnlink.status).toEqual(statusBeforeUnlink)

    await SystemLogsPage.open()
    const card = await browser.waitUntil(
      async () => {
        await SystemLogsPage.searchFor(refNo)
        return (await SystemLogsPage.unlinkLogCard()) ?? false
      },
      {
        timeout: 15000,
        interval: 1000,
        timeoutMsg: `unlink system log did not appear for ${refNo}`
      }
    )

    const contextText = await SystemLogsPage.logCardField(card, 'Context')
    expect(contextText).toContain('organisationId')
    expect(contextText).toContain('unlinkedDefraOrganisation')
    expect(contextText).toContain(defraOrg.defraOrgId)
    expect(contextText).toContain(defraOrg.defraOrgName)

    const userEmail = await SystemLogsPage.logCardField(card, 'User email')
    expect(userEmail).toBeTruthy()
  })
})
