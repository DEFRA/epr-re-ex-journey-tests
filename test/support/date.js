export const todayddMMMMyyyy = new Date().toLocaleDateString('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric'
})

export const currentYear = () => new Date().getUTCFullYear()

// The backend runs with OPEN_NEXT_YEAR in this stack and the lower envs.
export const latestOpenYear = () => currentYear() + 1

export const MONTHS_OF_THE_YEAR = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
]
