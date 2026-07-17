import allureReporter from '@wdio/allure-reporter'

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
  violations.forEach((violation, index) => {
    allureReporter.startStep(
      `Violation ${index + 1}: ${violation.id} | Impact: ${violation.impact}`
    )

    // Add affected elements
    const elementsHTML = violation.nodes.map((node) => node.html).join('<br>')

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

    allureReporter.addAttachment(`Output`, outputHtml, 'text/html')

    allureReporter.addAttachment(`Output (JSON)`, output, 'text/plain')

    allureReporter.endStep(
      /** @type {import('allure-js-commons').Status} */ ('failed')
    )
  })
}
