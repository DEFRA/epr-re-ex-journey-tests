import { step, attachment } from 'allure-js-commons'

function convertHTML(str) {
  const symbols = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;'
  }
  for (const symbol in symbols) {
    if (str.indexOf(symbol) >= 0) {
      const newStr = str.replaceAll(symbol, symbols[symbol])
      return newStr
    }
  }
  return str
}

export async function logViolationsToAllure(violations) {
  for (const [index, violation] of violations.entries()) {
    await step(
      `Violation ${index + 1}: ${violation.id} | Impact: ${violation.impact}`,
      async () => {
        const elementsHTML = violation.nodes
          .map((node) => node.html)
          .join('<br>')

        const output = {
          impact: violation.impact,
          description: violation.description,
          elements: elementsHTML,
          helpUrl: violation.helpUrl,
          tags: violation.tags.join(', ')
        }

        const html = convertHTML(elementsHTML)

        const outputHtml = `<p><ul>
                                <li><b>Impact:</b> ${violation.impact}</li>
                                <li><b>Description:</b> ${violation.description}</li>
                                <li><b>Elements:</b> <pre>${html}</pre></li>
                                <li><b>Help URL:</b> <a href="${violation.helpUrl}" target="_blank">${violation.helpUrl}</a></li>
                                <li><b>Tags:</b> ${violation.tags.join(', ')}</li>
                               </ul></p>`

        await attachment(`Output`, outputHtml, 'text/html')

        await attachment(
          `Output (JSON)`,
          JSON.stringify(output, null, 2),
          'text/plain'
        )
      }
    )
  }
}
