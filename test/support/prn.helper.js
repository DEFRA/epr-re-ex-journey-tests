import { expect } from '@playwright/test'
import { CheckBeforeCreatingPRNPage } from 'page-objects/check.before.creating.prn.page.js'
import { PRNViewPage } from 'page-objects/prn.view.page.js'
import { CreatePRNPage } from 'page-objects/create.prn.page.js'
import { PRNDashboardPage } from 'page-objects/prn.dashboard.page.js'
import { PRNIssuedPage } from 'page-objects/prn.issued.page.js'
import { todayddMMMMyyyy } from './date.js'
import { PRNCreatedPage } from 'page-objects/prn.created.page.js'
import { ConfirmCancelPRNPage } from 'page-objects/confirm.cancel.prn.page.js'
import { PRNCancelledPage } from 'page-objects/prn.cancelled.page.js'

export class PrnHelper {
  /**
   * @param {import('@playwright/test').Page} page
   * @param {boolean} isPern
   */
  constructor(page, isPern = false) {
    this.prnWording = isPern ? 'PERN' : 'PRN'
    this.isPern = isPern
    this.checkBeforeCreatingPrnPage = new CheckBeforeCreatingPRNPage(page)
    this.prnViewPage = new PRNViewPage(page)
    this.createPRNPage = new CreatePRNPage(page)
    this.prnDashboardPage = new PRNDashboardPage(page)
    this.prnIssuedPage = new PRNIssuedPage(page)
    this.prnCreatedPage = new PRNCreatedPage(page)
    this.confirmCancelPrnPage = new ConfirmCancelPRNPage(page)
    this.prnCancelledPage = new PRNCancelledPage(page)
  }

  async checkPrnDetails(expectedPrnDetails) {
    const prnDetails = await this.checkBeforeCreatingPrnPage.prnDetails()
    expect(prnDetails.Issuer).toBe(expectedPrnDetails.companyName)
    expect(prnDetails['Packaging producer or compliance scheme']).toBe(
      expectedPrnDetails.tradingName
    )
    expect(prnDetails.Tonnage).toBe(
      `${expectedPrnDetails.tonnageWordings.integer}`
    )
    expect(prnDetails['Tonnage in words']).toBe(
      expectedPrnDetails.tonnageWordings.word
    )
    expect(prnDetails['Process to be used']).toBe(expectedPrnDetails.process)
    expect(prnDetails['Issuer notes']).toBe(
      expectedPrnDetails.issuerNotesToCheck
    )

    const accreditationDetails =
      await this.checkBeforeCreatingPrnPage.accreditationDetails()

    expect(accreditationDetails.Material).toBe(expectedPrnDetails.materialDesc)
    expect(accreditationDetails['Accreditation number']).toBe(
      expectedPrnDetails.accNumber
    )
    if (!this.isPern) {
      expect(
        accreditationDetails['Reprocessing site'].replaceAll(', ', ',')
      ).toBe(expectedPrnDetails.regAddress)
    }
  }

  async checkViewPrnDetails(expectedPrnDetails) {
    const headingText = await this.prnViewPage.headingText()
    if (!this.isPern) {
      expect(headingText).toBe('Packaging Waste Recycling Note')
    } else {
      expect(headingText).toBe('Packaging Waste Export Recycling Note')
    }
    const prnViewDetails = await this.prnViewPage.prnDetails()
    expect(prnViewDetails[`${this.prnWording} number`]).toBe(
      expectedPrnDetails.prnNumber
    )
    expect(prnViewDetails['Packaging producer or compliance scheme']).toBe(
      expectedPrnDetails.tradingName
    )
    expect(prnViewDetails.Tonnage).toBe(
      `${expectedPrnDetails.tonnageWordings.integer}`
    )
    expect(prnViewDetails['Issuer notes']).toBe(expectedPrnDetails.issuerNotes)
    expect(prnViewDetails['Issued date']).toBe(expectedPrnDetails.issuedDate)
    expect(prnViewDetails.Status).toBe(expectedPrnDetails.status)
    expect(prnViewDetails['December waste']).toBe('No')
    expect(prnViewDetails['Tonnage in words']).toBe(
      expectedPrnDetails.tonnageWordings.word
    )
    expect(prnViewDetails['Process to be used']).toBe(
      expectedPrnDetails.process
    )

    const accreditationViewDetails =
      await this.prnViewPage.accreditationDetails()
    expect(accreditationViewDetails.Material).toBe(
      expectedPrnDetails.materialDesc
    )
    expect(accreditationViewDetails['Accreditation number']).toBe(
      expectedPrnDetails.accNumber
    )
    if (!this.isPern) {
      expect(
        accreditationViewDetails['Reprocessing site'].replaceAll(', ', ',')
      ).toBe(expectedPrnDetails.regAddress)
    }
  }

  async createAndCheckPrnDetails(prnDetails) {
    await this.createAndCheckDraftPrn(prnDetails)
    await this.checkBeforeCreatingPrnPage.createPRN()
    const message = await this.prnCreatedPage.messageText()
    expect(message).toContain(`${this.prnWording} created`)
    expect(message).toContain('Awaiting authorisation')
    prnDetails.status = 'Awaiting authorisation'
    prnDetails.createdDate = todayddMMMMyyyy
  }

  async createAndCheckDraftPrn(prnDetails) {
    await this.createPRNPage.createPrn(
      prnDetails.tonnageWordings.integer,
      prnDetails.tradingName,
      prnDetails.issuerNotes
    )

    if (prnDetails.issuerNotes === '') {
      prnDetails.issuerNotesToCheck = 'Not provided'
    } else {
      prnDetails.issuerNotesToCheck = prnDetails.issuerNotes
    }
    const headingText = await this.checkBeforeCreatingPrnPage.headingText()
    expect(headingText).toBe(`Check before creating ${this.prnWording}`)
    await this.checkPrnDetails(prnDetails)
  }

  async checkAwaitingRows(prnDetails, rowIndex, tableIndex = 1) {
    const awaitingRow = await this.prnDashboardPage.getAwaitingRow(
      rowIndex,
      tableIndex
    )
    expect(awaitingRow.get('Producer or compliance scheme')).toEqual(
      prnDetails.tradingName
    )
    expect(awaitingRow.get('Date created')).toEqual(prnDetails.createdDate)
    expect(awaitingRow.get('Tonnage')).toEqual(
      `${prnDetails.tonnageWordings.integer}`
    )
    expect(awaitingRow.get('Status')).toEqual(prnDetails.status)
  }

  async checkTableRows(tableRow, prnDetails) {
    expect(tableRow.get(`${this.prnWording} number`)).toEqual(
      prnDetails.prnNumber
    )
    expect(tableRow.get('Producer or compliance scheme')).toEqual(
      prnDetails.tradingName
    )
    expect(tableRow.get('Date issued')).toEqual(prnDetails.issuedDate)
    expect(tableRow.get('Tonnage')).toEqual(
      `${prnDetails.tonnageWordings.integer}`
    )
    expect(tableRow.get('Status')).toEqual(prnDetails.status)
  }

  async checkCancelledRows(prnDetails, rowIndex) {
    const cancelledRow = await this.prnDashboardPage.getCancelledRow(rowIndex)
    await this.checkTableRows(cancelledRow, prnDetails)
  }

  async checkIssuedRows(prnDetails, rowIndex) {
    const issuedRow = await this.prnDashboardPage.getIssuedRow(rowIndex)
    await this.checkTableRows(issuedRow, prnDetails)
  }

  async issuePrnAndUpdateDetails(
    prnDetails,
    prnPrefix = 'SR',
    { checkDoubleClick = false } = {}
  ) {
    if (checkDoubleClick) {
      await this.prnViewPage.issueAndCheckDoubleClickPrevented()
    } else {
      await this.prnViewPage.issuePRNButton()
    }

    const awaitingAcceptanceStatus = 'Awaiting acceptance'
    const prnIssuedText = await this.prnIssuedPage.messageText()

    expect(prnIssuedText).toContain(
      `${this.prnWording} issued to ` + prnDetails.tradingName
    )
    expect(prnIssuedText).toContain(`${this.prnWording} number:`)
    const prnNumber = await this.prnIssuedPage.prnNumberText()
    const prnNoPattern = new RegExp(`${prnPrefix}\\d{5,9}`)
    expect(prnNoPattern.test(prnNumber)).toEqual(true)

    prnDetails.status = awaitingAcceptanceStatus
    prnDetails.issuedDate = todayddMMMMyyyy
    prnDetails.prnNumber = prnNumber
  }

  async checkIssuedPageLinks() {
    const managePRNsElement = await this.prnIssuedPage.managePRNs()
    const issueAnotherPRNElement = await this.prnIssuedPage.issueAnotherPRN()
    expect(managePRNsElement.getAttribute('href')).toEqual(
      issueAnotherPRNElement.getAttribute('href')
    )
  }

  async cancelPRNAndReturnToPRNsDashboard(
    prnDetails,
    { checkDoubleClick = false } = {}
  ) {
    await this.prnViewPage.cancelPRNButton()
    const confirmCancelHeading = await this.confirmCancelPrnPage.headingText()
    expect(confirmCancelHeading).toBe(
      `Confirm cancellation of this ${this.prnWording}`
    )

    if (checkDoubleClick) {
      await this.confirmCancelPrnPage.confirmCancelAndCheckDoubleClickPrevented()
    } else {
      await this.confirmCancelPrnPage.confirmCancelPrn()
    }
    const cancelledMessageText = await this.prnCancelledPage.messageText()
    expect(cancelledMessageText).toContain(`${this.prnWording} cancelled`)

    const prnStatus = await this.prnCancelledPage.statusText()
    expect(prnStatus).toContain('Cancelled')
    prnDetails.status = 'Cancelled'
    if (!this.isPern) {
      await this.prnCancelledPage.prnsPage()
    } else {
      await this.prnCancelledPage.pernsPage()
    }
  }
}
