export const todayddMMMMyyyy = new Date().toLocaleDateString('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric'
})

/**
 * The abbreviated form the regulator's pages use — "8 Sept 2026" where the
 * operator's own pages write "8 September 2026". The two audiences format the
 * same date differently, so a spec that crosses between them needs both.
 */
export const todayddMMMyyyy = new Date().toLocaleDateString('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric'
})
