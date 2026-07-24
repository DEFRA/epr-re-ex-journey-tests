import {
  step,
  attachment,
  epic,
  feature,
  story,
  descriptionHtml
} from 'allure-js-commons'
import AxeBuilder from '@axe-core/playwright'

// Impact isn't always present on a violation (axe-core's `impact` field is
// optional), so anything unrecognised sorts after the known levels rather
// than throwing the summary table ordering off.
const IMPACT_RANK = { critical: 0, serious: 1, moderate: 2, minor: 3 }

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

// Unlike convertHTML above (which only replaces the first special character
// it finds - fine for the element-markup preview it's used for), this needs
// to escape every occurrence so free-text table cells can't break the
// summary table's markup.
function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

/**
 * Tags the current test with an Accessibility epic/feature so Allure's
 * Behaviors tab groups every accessibility scan into its own section,
 * separate from the rest of the suite.
 * @param {string} storyName - what this test's tour covers, e.g. "Exporter dashboard, upload and report flow"
 */
export async function tagAccessibilityTest(storyName) {
  await epic('Accessibility')
  await feature('WCAG Accessibility scans')
  await story(storyName)
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

// Sets the test's description to one table covering every violation found
// across the whole tour (not just Serious/Critical), sorted worst-first.
// Allure renders the description at the top of the test page, above the
// step list, so this is visible immediately on opening the test rather
// than requiring a scroll past every page's own scan step to find it.
async function setAccessibilitySummaryDescription(violations) {
  if (violations.length === 0) {
    await descriptionHtml('<p>No accessibility violations found.</p>')
    return
  }

  const sorted = [...violations].sort(
    (a, b) =>
      (IMPACT_RANK[a.impact] ?? IMPACT_RANK.minor + 1) -
      (IMPACT_RANK[b.impact] ?? IMPACT_RANK.minor + 1)
  )

  const rows = sorted
    .map(
      (violation) => `<tr>
        <td>${escapeHtml(violation.pageName)}</td>
        <td>${escapeHtml(violation.impact ?? 'unknown')}</td>
        <td>${escapeHtml(violation.id)}</td>
        <td>${escapeHtml(violation.description)}</td>
        <td><a href="${violation.helpUrl}" target="_blank">Help</a></td>
      </tr>`
    )
    .join('')

  const pageCount = new Set(violations.map((violation) => violation.pageName))
    .size

  await descriptionHtml(
    `<p><b>${violations.length}</b> violation(s) across <b>${pageCount}</b> page(s):</p>
    <table>
      <thead>
        <tr><th>Page</th><th>Impact</th><th>Rule</th><th>Description</th><th>Help</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`
  )
}

/**
 * Sets a consolidated summary of every violation found as the test's
 * description, then fails with a single error listing every
 * Serious/Critical violation across all pages scanned, rather than
 * stopping at the first one - so a multi-page tour surfaces every
 * offending page in one run instead of requiring a fix-rerun cycle per
 * page.
 * @param {Array<{pageName: string, id: string, impact: string, description: string, helpUrl: string}>} violations - accumulated output of scanPageForAccessibilityViolations
 */
export async function assertNoSeriousOrCriticalViolations(violations) {
  await setAccessibilitySummaryDescription(violations)

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
