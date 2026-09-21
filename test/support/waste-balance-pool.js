// The two waste balance pools an accreditation's December Waste declaration
// window can split a balance into (see create.prn.page.js's
// "Select which waste balance" radios). These strings are also the sentinel
// values compared and prefix-matched against the rendered radio labels, so
// they must stay exactly as GOV.UK renders them.
export const WASTE_BALANCE_POOL = Object.freeze({
  december: 'December',
  nonDecember: 'Non-December'
})
