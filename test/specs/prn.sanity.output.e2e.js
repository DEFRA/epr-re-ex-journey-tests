import { $, browser, expect } from '@wdio/globals'
import HomePage from 'page-objects/homepage.js'
import WasteRecordsPage from '../page-objects/waste.records.page.js'
import DashboardPage from '../page-objects/dashboard.page.js'
import { createOrgWithAllWasteProcessingTypeAllMaterials } from '../support/apicalls.js'
import PrnCreatedPage from 'page-objects/prn.created.page.js'
import { MATERIALS } from '../support/materials.js'
import UploadSummaryLogPage from 'page-objects/upload.summary.log.page.js'
import {
  createPrnDetails,
  thirdTradingName as tradingName
} from '../support/fixtures.js'
import { PrnHelper } from '../support/prn.helper.js'
import { createLinkAndLogin } from '../support/login-helper.js'

describe('Packing Recycling Notes (Sanity)', () => {
  it('Should be able to create and manage PRNs for all materials for Reprocessor Output @sanitycheck', async () => {
    const { organisationDetails, userEmail } =
      await createOrgWithAllWasteProcessingTypeAllMaterials()
    await createLinkAndLogin(organisationDetails.refNo, userEmail)

    let orgAddressIndex = 8

    const tonnageWordingsOutput = [
      { integer: 245, word: 'Two hundred and forty five' },
      {
        integer: 18923,
        word: 'Eighteen thousand nine hundred and twenty three'
      },
      { integer: 5, word: 'Five' },
      {
        integer: 27482,
        word: 'Twenty seven thousand four hundred and eighty two'
      },
      { integer: 9307, word: 'Nine thousand three hundred and seven' },
      { integer: 42, word: 'Forty two' },
      {
        integer: 43516,
        word: 'Forty three thousand five hundred and sixteen'
      },
      { integer: 156, word: 'One hundred and fifty six' }
    ]

    // Sanity check Reprocessor Output materials
    for (let i = 0; i < MATERIALS.length; i++) {
      await DashboardPage.selectTableLink(2, i + 1)

      const regNumber = `R25SR500010912${MATERIALS[i].suffix}`
      const accNumber = `R-ACC12145${MATERIALS[i].suffix}`

      const regNo = await $(`//a[normalize-space()="${regNumber}"]`)
      await expect(regNo).toExist()

      const accNo = await $(`//a[normalize-space()="${accNumber}"]`)
      await expect(accNo).toExist()

      await WasteRecordsPage.submitSummaryLogLink()

      await UploadSummaryLogPage.performUploadAndReturnToHomepage(
        `resources/sanity/reprocessorOutput_${accNumber}_${regNumber}.xlsx`
      )

      await DashboardPage.selectTableLink(2, i + 1)
      await WasteRecordsPage.createNewPRNLink()

      const prnHelper = new PrnHelper()
      const prnDetails = createPrnDetails({
        tonnageWordings: tonnageWordingsOutput[i],
        tradingName,
        organisationDetails,
        regAddress: organisationDetails.regAddresses[orgAddressIndex],
        materialDesc: MATERIALS[i].prnName,
        accNumber,
        process: MATERIALS[i].process
      })

      await prnHelper.createAndCheckPrnDetails(prnDetails)
      await PrnCreatedPage.returnToRegistrationPage()

      orgAddressIndex++
    }

    await HomePage.signOut()
    await expect(browser).toHaveTitle(expect.stringContaining('Signed out'))
  })
})
