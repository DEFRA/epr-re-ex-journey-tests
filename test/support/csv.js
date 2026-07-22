/**
 * Tokenises a full CSV body into rows of fields, honouring fast-csv's default
 * selective quoting - including a quoted field that itself contains embedded
 * newlines (e.g. the public register's multi-line "Registered office" header
 * cell). Splitting the body on `\r?\n` before parsing quotes (the previous
 * approach) breaks on exactly that case: a literal newline inside a quoted
 * field gets mistaken for a row boundary, truncating the row from that field
 * onward.
 * @param {string} body
 * @returns {string[][]}
 */
function parseCsvBody(body) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < body.length; i++) {
    const character = body[i]

    if (inQuotes) {
      if (character === '"' && body[i + 1] === '"') {
        field += '"'
        i++
      } else if (character === '"') {
        inQuotes = false
      } else {
        field += character
      }
    } else if (character === '"') {
      inQuotes = true
    } else if (character === ',') {
      row.push(field)
      field = ''
    } else if (character === '\r' && body[i + 1] === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i++
    } else if (character === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += character
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ''))
}

/**
 * Parses a downloaded report CSV into one record per data row, keyed by column
 * name so that an inserted column relocates a value rather than silently
 * retargeting an assertion onto its neighbour.
 *
 * The body opens with a title/generated-at preamble, so the header is located
 * by its first column's name rather than assumed to be row one.
 *
 * @param {string} body
 * @param {string} [headerPrefix] - First column of the header row (a trailing
 *   comma, if present, is ignored), used to locate it amongst the preamble
 *   (e.g. 'Regulator,' for report submissions, 'Type,' for the public
 *   register).
 * @returns {Record<string, string>[]}
 */
export function parseCsvRows(body, headerPrefix = 'Regulator,') {
  const expectedFirstColumn = headerPrefix.replace(/,$/, '')
  const rows = parseCsvBody(body)
  const headerIndex = rows.findIndex((row) => row[0] === expectedFirstColumn)

  if (headerIndex === -1) {
    throw new Error('CSV header row not found')
  }

  const names = rows[headerIndex]

  return rows
    .slice(headerIndex + 1)
    .map((row) =>
      Object.fromEntries(names.map((name, index) => [name, row[index]]))
    )
}
