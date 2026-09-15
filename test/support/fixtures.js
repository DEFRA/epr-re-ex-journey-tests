import { todayddMMMMyyyy } from './date.js'

export const tradingName = 'CS_GENERATED_3982709_England'

// Actual trading name is test10 for this waste org, but as its a Large Producer, the organisation name is used instead
export const secondTradingName = 'Ball Corporation'

export const thirdTradingName =
  '13 MARLBOROUGH BUILDINGS (BATH) MANAGEMENT COMPANY LTD'

export const tonnageWordings = {
  integer: 203,
  word: 'Two hundred and three'
}

/**
 * @param {Object} params
 * @param {string} [params.process]
 * @param {string} [params.materialDesc]
 * @param {string} [params.accNumber]
 * @param {string} [params.tradingName]
 * @param {string} [params.issuerNotes]
 * @param {Object} [params.organisationDetails]
 * @param {string} [params.regAddress]
 * @param {Object} [params.tonnageWordings]
 * @param {string} [params.selectDecemberWasteAnswer] - 'Yes' or 'No' to click on the create-PRN
 *   radios (only when the radios are expected to render); omit to leave them untouched.
 * @param {string} [params.wasteBalancePool] - 'December' or 'Non-December' to
 *   click on the create-PRN "Select which waste balance" radios (mutually
 *   exclusive with selectDecemberWasteAnswer - an accreditation renders one
 *   control or the other, never both); omit to leave them untouched.
 */
export const createPrnDetails = ({
  process = 'R3',
  materialDesc = 'Plastic',
  accNumber = '',
  tradingName = 'CS_GENERATED_3982709_England',
  issuerNotes = 'Testing',
  organisationDetails,
  regAddress = '',
  tonnageWordings = {
    integer: 203,
    word: 'Two hundred and three'
  },
  selectDecemberWasteAnswer,
  wasteBalancePool
} = {}) => {
  const companyName = organisationDetails.organisation?.companyName ?? ''
  if (regAddress === '') {
    regAddress = organisationDetails.regAddresses?.[0]
  }

  return {
    tonnageWordings,
    tradingName,
    issuerNotes,
    companyName,
    regAddress,
    status: '',
    materialDesc,
    accNumber,
    prnNumber: '',
    issuedDate: '',
    process,
    createdDate: todayddMMMMyyyy,
    selectDecemberWasteAnswer,
    wasteBalancePool,
    // The persisted value the check/view pages show, regardless of whether
    // either control was touched: unticked (or never rendered) always means
    // No, and the pool radios set isDecemberWaste true only when December is
    // chosen.
    decemberWaste:
      selectDecemberWasteAnswer ??
      (wasteBalancePool === 'December' ? 'Yes' : 'No')
  }
}
