import { step, attachment } from 'allure-js-commons'
import AxeBuilder from '@axe-core/playwright'

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

/**
 * Runs an axe scan against the page's current state, logs any violations to
 * Allure grouped under a step named for the page, and returns the violations
 * tagged with pageName so callers can accumulate them across a multi-page
 * tour and report every offending page in one assertion.
 * @param {import('@playwright/test').Page} page
 * @param {string} pageName
 */
export async function scanPageForAccessibilityViolations(page, pageName) {
  const builder = new AxeBuilder({ page })
  const results = await builder.analyze()

  await step(`Accessibility scan: ${pageName}`, async () => {
    await logViolationsToAllure(results.violations)
  })

  return results.violations.map((violation) => ({ ...violation, pageName }))
}

/**
 * Fails with a single summary error listing every Serious/Critical violation
 * across all pages scanned, rather than stopping at the first one - so a
 * multi-page tour surfaces every offending page in one run instead of
 * requiring a fix-rerun cycle per page.
 * @param {Array<object>} violations - accumulated output of scanPageForAccessibilityViolations
 */
export function assertNoSeriousOrCriticalViolations(violations) {
  const severe = violations.filter(
    (violation) =>
      violation.impact === 'critical' || violation.impact === 'serious'
  )

  if (severe.length > 0) {
    const summary = severe
      .map(
        (violation) =>
          `- [${violation.pageName}] ${violation.id} (${violation.impact}): ${violation.description}`
      )
      .join('\n')
    throw new Error(
      `Found ${severe.length} Serious/Critical accessibility violation(s):\n${summary}`
    )
  }
}
