/**
 * Parse a tonnage value out of UI text into a number for numeric comparison.
 * Handles the two rendered forms used across the app — the bare formatted
 * total on the report detail page ("26.60") and the waste-balance figure with
 * its unit suffix ("26.60 tonnes") — plus thousand separators ("1,234.50").
 *
 * @param {string} text - rendered tonnage text
 * @returns {number}
 */
export function parseTonnage(text) {
  const cleaned = String(text)
    .replace(/tonnes?/i, '')
    .replace(/,/g, '')
    .trim()
  return Number.parseFloat(cleaned)
}
