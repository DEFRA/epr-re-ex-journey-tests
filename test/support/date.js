export const todayddMMMMyyyy = new Date().toLocaleDateString('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric'
})

/** The abbreviated form the regulator's pages use: "8 Sept 2026". */
export const todayddMMMyyyy = new Date().toLocaleDateString('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric'
})
