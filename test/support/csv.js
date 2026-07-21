/**
 * Splits a single CSV row into fields, honouring fast-csv's default selective
 * quoting so a quoted value containing a comma (e.g. an organisation name)
 * stays one field.
 * @param {string} row
 * @returns {string[]}
 */
export function parseCsvRow(row) {
  const fields = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < row.length; i++) {
    const character = row[i]

    if (inQuotes) {
      if (character === '"' && row[i + 1] === '"') {
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
      fields.push(field)
      field = ''
    } else {
      field += character
    }
  }

  fields.push(field)
  return fields
}

/**
 * Parses a downloaded report CSV into one record per data row, keyed by column
 * name so that an inserted column relocates a value rather than silently
 * retargeting an assertion onto its neighbour.
 *
 * The body opens with a title/generated-at preamble, so the header is located
 * by its first column rather than assumed to be line one.
 *
 * @param {string} body
 * @returns {Record<string, string>[]}
 */
export function parseCsvRows(body) {
  const lines = body.split(/\r?\n/).filter((line) => line.trim().length > 0)
  const headerIndex = lines.findIndex((line) => line.startsWith('Regulator,'))

  if (headerIndex === -1) {
    throw new Error('CSV header row not found')
  }

  const names = parseCsvRow(lines[headerIndex])

  return lines.slice(headerIndex + 1).map((line) => {
    const values = parseCsvRow(line)
    return Object.fromEntries(names.map((name, index) => [name, values[index]]))
  })
}
