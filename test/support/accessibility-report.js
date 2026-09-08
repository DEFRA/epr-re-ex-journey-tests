// Builds the combined Axe + Lighthouse HTML report attached to Allure by
// accessibility.js. Adapted from ccts-accessibility-automation-wcagchecker's
// WebdriverIO-flavoured `wcag-js-v2` package (reportByCategory.js,
// performanceReport.js, utils.js) - that package can't be used directly here
// as it drives a WDIO `driver` (execute/executeAsync) rather than a
// Playwright `page`, but its report layout and CSS are reused.

const REPORT_STYLES = `
.stats-chart-row { display: block; height: 25px; }
.stats-chart-row-label { font-size: 12px; width: 50%; float: left; }
.stats-chart-row-value { font-size: 12px; float: right; margin-left: 5px; }
.stats-chart-row-value.color-critical { color: #f66; }
.stats-chart-row-value.color-medium { color: #eeb943; }
.stats-chart-row-items { font-size: 12px; float: right; }
.stats-chart-row-bar { position: relative; float: left; height: 5px; background-color: #4c608d; width: 100%; margin-bottom: 10px; }
.stats-chart-row-bar-value { position: absolute; top: 0; left: 0; height: 5px; }
.stats-chart-row-bar-value.color-critical { background-color: #f66; }
.stats-chart-row-bar-value.color-medium { background-color: #eeb943; }
.block-color { background-color: #334670; }
.complaint-text { font-size: 12px; }
.bg-danger-light { background-color: #ff704d; }
.accordion-item.custom { --bs-accordion-active-bg: #ff704d; --bs-accordion-active-color: #fff; }
.page-section { page-break-after: always; break-after: page; page-break-inside: avoid; margin-bottom: 24px; }
.page-section:last-child { page-break-after: auto; }
h6.text-secondary { overflow-wrap: anywhere; word-break: break-word; }
.wrapper-80 { max-width: 80vw; margin: 0 auto; }
.score-badge { font-weight: 600; border-radius: 999px; padding: 0.15rem 0.55rem; font-size: 0.8rem; }
.score-good { background: #0c9b4b; color: #fff; }
.score-ok { background: #f7a928; color: #000; }
.score-bad { background: #d93025; color: #fff; }
.metric-label { font-size: 0.8rem; text-transform: uppercase; color: #666; }
.metric-value { font-weight: 600; }
.metric-sub { font-size: 0.75rem; color: #777; }
.url-text { font-size: 0.9rem; word-break: break-all; }
`

function formatDateTime(date) {
  const pad = (value) => String(value).padStart(2, '0')
  return (
    `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  )
}

function encodeHtml(str) {
  if (!str) return ''
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function sanitizeSnippet(str) {
  return (str || '')
    .trim()
    .replaceAll(/(\r\n|\n)/g, '')
    .replaceAll(/ {2}/g, '')
    .replaceAll(/&/g, '&amp;')
    .replaceAll(/</g, '&lt;')
    .replaceAll(/>/g, '&gt;')
    .replaceAll(/"/g, '&quot;')
    .replaceAll(/'/g, '&#039;')
}

// --- Deserializing Axe/Lighthouse raw results into one common shape ------

function axeViolationsToReportItems(violations) {
  return violations.map((violation) => {
    const tags = (violation.tags || []).filter(
      (tag) => tag.startsWith('wcag') || tag.startsWith('cat.')
    )

    let actions = ''
    const elementXPath = violation.nodes.map((node) => {
      if (actions === '') actions = encodeHtml(node.failureSummary)
      return sanitizeSnippet(node.html)
    })

    const helpUrl = (violation.helpUrl || '').trim()

    return {
      title: violation.id,
      summary: encodeHtml(violation.description),
      purpose: encodeHtml(violation.help),
      actions,
      elementXPath,
      type: violation.impact,
      tool: 'Axe',
      guidelineCode: tags.join(', '),
      guidelineLink: helpUrl.startsWith('https://') ? helpUrl : ''
    }
  })
}

// Lighthouse's accessibility-category audits are themselves built on
// axe-core, so a failing one carries the same `details.debugData`
// (impact/tags) shape as a raw Axe violation. Restricting to the category's
// own auditRefs (rather than shape-sniffing debugData) is what keeps
// performance insight audits (e.g. dom-size-insight, which also sets
// debugData) out of this accessibility-only report.
function lighthouseAuditsToReportItems(lhr) {
  const accessibilityAuditIds = new Set(
    (lhr.categories.accessibility?.auditRefs || []).map((ref) => ref.id)
  )

  const failingAudits = Object.values(lhr.audits).filter(
    (audit) =>
      accessibilityAuditIds.has(audit.id) &&
      audit.score !== 1 &&
      audit.scoreDisplayMode !== 'notApplicable'
  )

  return failingAudits
    .filter((audit) => {
      const items = audit.details?.items || []
      return audit.details?.debugData !== undefined && items.length > 0
    })
    .map((audit) => {
      const debugData = audit.details.debugData
      const items = audit.details.items

      let actions = ''
      const elementXPath = items.map((item) => {
        const node = item.node || {}
        if (actions === '') actions = encodeHtml(node.explanation)
        return sanitizeSnippet(node.snippet)
      })

      const match = audit.description?.match(/\[.*?\]\((https?:\/\/[^\s)]+)\)/)

      return {
        title: audit.id,
        summary: encodeHtml(audit.title),
        purpose: encodeHtml(audit.description),
        actions,
        elementXPath,
        type: debugData.impact,
        tool: 'Lighthouse',
        guidelineCode: (debugData.tags || [])
          .filter((tag) => tag.startsWith('wcag') || tag.startsWith('cat.'))
          .join(', '),
        guidelineLink: match ? match[1] : ''
      }
    })
}

// Lighthouse's accessibility category audits are generated from axe-core and
// keep the same rule id (e.g. 'color-contrast'), so grouping by title alone
// - rather than `${tool}:${title}` - merges an Axe finding and Lighthouse's
// audit of the same rule into one issue instead of double-counting it.
function groupByIssueType(items) {
  const grouped = new Map()

  items.forEach((item) => {
    const key = item.title
    if (!grouped.has(key)) {
      grouped.set(key, { ...item, elementXPath: [...item.elementXPath] })
    } else {
      const existing = grouped.get(key)
      existing.elementXPath = existing.elementXPath.concat(item.elementXPath)
      if (!existing.tool.includes(item.tool)) {
        existing.tool = `${existing.tool} + ${item.tool}`
      }
    }
  })

  return [...grouped.values()]
}

const SEVERITY_BY_TYPE = {
  error: {
    label: 'critical',
    headerClass: 'bg-danger bg-gradient',
    weight: 'critical'
  },
  contrast: {
    label: 'critical',
    headerClass: 'bg-danger bg-gradient',
    weight: 'critical'
  },
  critical: {
    label: 'critical',
    headerClass: 'bg-danger bg-gradient',
    weight: 'critical'
  },
  serious: {
    label: 'serious',
    headerClass: 'bg-danger-light',
    weight: 'critical'
  },
  alert: { label: 'medium', headerClass: 'bg-warning', weight: 'medium' },
  moderate: { label: 'medium', headerClass: 'bg-warning', weight: 'medium' }
}

function renderIssueAccordion(item, accordionId) {
  const count = item.elementXPath.length
  const severity = SEVERITY_BY_TYPE[item.type] || {
    label: 'low',
    headerClass: 'bg-success',
    weight: null
  }

  const guidelineHtml = item.guidelineLink
    ? `${item.guidelineCode} <a href="${item.guidelineLink}" target="_blank" rel="noopener noreferrer">${item.guidelineLink}</a>`
    : item.guidelineCode || 'NA'

  const xpathHtml = item.elementXPath
    .map((xpath) => `<li>${xpath}</li>`)
    .join('')

  const html = `
    <div class="accordion-item ${severity.weight === 'critical' ? 'custom' : ''}">
      <div class="accordion-header" id="heading-${accordionId}">
        <button class="accordion-button collapsed ${severity.headerClass} text-white text-opacity-75" type="button" data-bs-toggle="collapse" data-bs-target="#collapse-${accordionId}" aria-expanded="false" aria-controls="collapse-${accordionId}">
          <div class="row col-12 g-2">
            <div class="col-10 text-start">${encodeHtml(item.tool)}: ${encodeHtml(item.title)}</div>
            <div class="col-2">${count} ${severity.label} impact</div>
          </div>
        </button>
      </div>
      <div id="collapse-${accordionId}" class="accordion-collapse collapse" aria-labelledby="heading-${accordionId}">
        <div class="accordion-body">
          <div class="fw-bold mt-3 text-secondary">What It Means:</div>
          <div class="card-text mt-3">${item.summary}</div>
          <div class="fw-bold mt-3 text-secondary">Why It Matters:</div>
          <div class="card-text mt-3">${item.purpose}</div>
          <div class="fw-bold mt-3 text-secondary">How to Fix It:</div>
          <div class="card-text mt-3">${item.actions}</div>
          <div class="fw-bold mt-3 text-secondary">Standards and Guidelines:</div>
          <div class="card-text mt-3">${guidelineHtml}</div>
          <div class="fw-bold mt-3 text-secondary">Item's XPath:</div>
          <ul class="mt-3"><small>${xpathHtml}</small></ul>
        </div>
      </div>
    </div>`

  return { html, count, weight: severity.weight }
}

function renderPageSection(pageResult, pageIndex, totals) {
  const items = groupByIssueType([
    ...axeViolationsToReportItems(pageResult.axeViolations),
    ...(pageResult.lhr ? lighthouseAuditsToReportItems(pageResult.lhr) : [])
  ])

  let pageCritical = 0
  let pageMedium = 0

  const accordionsHtml = items
    .map((item, issueIndex) => {
      const { html, count, weight } = renderIssueAccordion(
        item,
        `p${pageIndex}i${issueIndex}`
      )
      if (weight === 'critical') {
        totals.critical += count
        pageCritical += count
      } else if (weight === 'medium') {
        totals.medium += count
        pageMedium += count
      }
      return html
    })
    .join('')

  const allItemsCount = pageCritical + pageMedium || 1
  const criticalPct = ((pageCritical / allItemsCount) * 100).toFixed(2)
  const mediumPct = ((pageMedium / allItemsCount) * 100).toFixed(2)

  const message =
    pageCritical > 0
      ? 'This page is at risk of accessibility issues.'
      : 'This page is not at risk of accessibility issues. However addressing medium findings is advisable.'

  return `
    <div class="page-section"><div class="container mt-4 bg-light shadow-lg"><div class="container-fluid p-3">
      <h6 class="text-secondary">Page ${pageIndex + 1} - ${encodeHtml(pageResult.pageName)} (${encodeHtml(pageResult.url)})</h6>
      <div class="row mt-3">
        <div class="col-6"><div class="card block-color text-white text-opacity-75"><div class="card-body">
          <div class="stats-chart-row"><div class="h6">Conformance</div></div>
          <div class="stats-chart-row"><span class="complaint-text">${message}</span></div>
          <div class="stats-chart-row"></div>
          <div class="stats-chart-row"><strong class="text-white text-opacity-75">Critical & Serious errors: ${pageCritical}</strong></div>
        </div></div></div>
        <div class="col-6"><div class="card block-color text-white text-opacity-75"><div class="card-body">
          <div class="stats-chart-row">
            <div class="stats-chart-row-label">Critical &amp; Serious</div>
            <div class="stats-chart-row-value color-critical"><span class="stat-percent">${criticalPct}</span>%</div>
            <div class="stats-chart-row-items"><span class="stat-item">${pageCritical}</span> <span class="stat-item-text">items</span></div>
            <div class="stats-chart-row-bar"><span class="stats-chart-row-bar-value color-critical" style="width: ${criticalPct}%;"></span></div>
          </div>
          <div class="stats-chart-row">
            <div class="stats-chart-row-label">Medium</div>
            <div class="stats-chart-row-value color-medium"><span class="stat-percent">${mediumPct}</span>%</div>
            <div class="stats-chart-row-items"><span class="stat-item">${pageMedium}</span> <span class="stat-item-text">items</span></div>
            <div class="stats-chart-row-bar"><span class="stats-chart-row-bar-value color-medium" style="width: ${mediumPct}%;"></span></div>
          </div>
        </div></div></div>
      </div><br>
      <div class="accordion-container">${accordionsHtml || '<p class="text-muted">No violations found.</p>'}</div>
    </div></div></div>`
}

// --- Lighthouse performance/SEO dashboard cards ---------------------------

function scoreInfo(score0to1) {
  if (score0to1 == null) return { scoreText: '–', cls: 'score-bad' }
  const score = Math.round(score0to1 * 100)
  if (score >= 90) return { scoreText: String(score), cls: 'score-good' }
  if (score >= 50) return { scoreText: String(score), cls: 'score-ok' }
  return { scoreText: String(score), cls: 'score-bad' }
}

function buildPerformanceCard(metrics) {
  const perfScore = scoreInfo(metrics.performance.score)
  const seoScore = scoreInfo(metrics.seo.score)
  const accScore = scoreInfo(metrics.accessibility.score)
  const metric = metrics.performance
  const diagnostics = metrics.diagnostics || []

  // pickDiagnostics only ever includes audits with score !== 1, so every
  // item here is a Fail (score null/0) or a Warn (score < 1) - never a Pass.
  const diagItemsHtml = diagnostics
    .map((audit) => {
      const isFail = audit.score === null || audit.score === 0
      const badgeClass = isFail ? 'bg-danger' : 'bg-warning text-dark'
      const label = isFail ? 'Fail' : 'Warn'
      return `<li class="mb-1"><span class="badge ${badgeClass} badge-pill me-1">${label}</span> ${encodeHtml(audit.title || audit.id)}</li>`
    })
    .join('')

  return `
    <div class="card mt-4 bg-light shadow-lg card mb-3">
      <div class="card-header bg-white border-0 pb-0">
        <div class="d-flex justify-content-between align-items-start">
          <div class="me-2">
            <div class="text-muted text-uppercase small">Page</div>
            <div class="url-text">${encodeHtml(metrics.pageName)} (${encodeHtml(metrics.url)})</div>
          </div>
          <div class="text-end">
            <div class="text-muted small">Scores</div>
            <div>
              <span class="score-badge ${perfScore.cls} me-1">Perf ${perfScore.scoreText}</span>
              <span class="score-badge ${seoScore.cls}">SEO ${seoScore.scoreText}</span>
              <span class="score-badge ${accScore.cls} me-1">A11y ${accScore.scoreText}</span>
            </div>
          </div>
        </div>
      </div>
      <div class="card-body pt-2 pb-1">
        <div class="row g-2 mb-2">
          <div class="col-md-4"><div class="metric-label">FCP</div><div class="metric-value">${metric.fcp?.displayValue || '–'}</div><div class="metric-sub">first-contentful-paint</div></div>
          <div class="col-md-4"><div class="metric-label">LCP</div><div class="metric-value">${metric.lcp?.displayValue || '–'}</div><div class="metric-sub">largest-contentful-paint</div></div>
          <div class="col-md-4"><div class="metric-label">Speed Index</div><div class="metric-value">${metric.speedIndex?.displayValue || '–'}</div><div class="metric-sub">speed-index</div></div>
          <div class="col-md-4"><div class="metric-label">TBT</div><div class="metric-value">${metric.tbt?.displayValue || '–'}</div><div class="metric-sub">total-blocking-time</div></div>
          <div class="col-md-4"><div class="metric-label">CLS</div><div class="metric-value">${metric.cls?.displayValue || '–'}</div><div class="metric-sub">cumulative-layout-shift</div></div>
          <div class="col-md-4"><div class="metric-label">TTI</div><div class="metric-value">${metric.tti?.displayValue || '–'}</div><div class="metric-sub">interactive</div></div>
        </div>
        <div class="row g-2 mb-2">
          <div class="col-md-4"><div class="metric-label">TTFB</div><div class="metric-value">${metric.ttfb?.displayValue || '–'}</div><div class="metric-sub">${metric.ttfb?.title || 'server-response-time'}</div></div>
          <div class="col-md-4"><div class="metric-label">DOM Size</div><div class="metric-value">${metric.domSize?.numericValue ?? '–'}</div><div class="metric-sub">dom-size</div></div>
          <div class="col-md-4"><div class="metric-label">Total Bytes</div><div class="metric-value">${metric.totalBytes?.displayValue || (metric.totalBytes?.numericValue ? (metric.totalBytes.numericValue / 1024).toFixed(0) + ' KB' : '–')}</div><div class="metric-sub">total-byte-weight</div></div>
          <div class="col-md-4"><div class="metric-label">JS Exec Time</div><div class="metric-value">${metric.jsExecution?.displayValue || '–'}</div><div class="metric-sub">bootup-time</div></div>
        </div>
        <div class="mt-2">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <span class="small text-muted">Diagnostics</span>
            <span class="badge bg-light text-secondary badge-pill">${diagnostics.length} issues</span>
          </div>
          <ul class="list-unstyled mb-0 small">${diagItemsHtml || '<li class="text-muted">No key issues</li>'}</ul>
        </div>
      </div>
      <div class="card-footer bg-white border-0 pt-0">
        <span class="small text-muted">Device: ${metrics.formFactor || 'unknown'} · Throttling: ${metrics.throttling}</span>
      </div>
    </div>`
}

/**
 * Builds a single HTML report covering every page a test scanned: a
 * category-grouped accordion of Axe + Lighthouse accessibility violations
 * per page (mirroring ccts-accessibility-automation-wcagchecker's report),
 * followed by a Lighthouse performance/SEO dashboard.
 * @param {{startDateTime: Date, pages: Array<{pageName: string, url: string, axeViolations: Array, lhr?: object, metrics?: object}>}} collector
 */
export function buildAccessibilityHtmlReport(collector) {
  const totals = { critical: 0, medium: 0 }

  const pageSectionsHtml = collector.pages
    .map((pageResult, index) => renderPageSection(pageResult, index, totals))
    .join('')

  const performanceCardsHtml = collector.pages
    .filter((pageResult) => pageResult.metrics)
    .map((pageResult) => buildPerformanceCard(pageResult.metrics))
    .join('')

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Accessibility &amp; Performance Report</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
  <style>${REPORT_STYLES}</style>
</head>
<body>
  <h1 class="mt-4 mb-3"><center>Accessibility Test Run Report</center></h1>
  <div class="page-section"><div class="container mt-4 bg-light shadow-lg"><div class="container-fluid p-3">
    <div class="text-secondary mb-4">Test Run: ${formatDateTime(collector.startDateTime)} - ${formatDateTime(new Date())}</div>
    <div class="row mb-3">
      <div class="col-4"><div class="card"><div class="card-header h6 block-color text-white text-opacity-75">Total Pages</div><div class="card-body text-center h6">${collector.pages.length}</div></div></div>
      <div class="col-4"><div class="card"><div class="card-header h6 bg-danger bg-gradient text-white text-opacity-75">Critical & Serious Issues</div><div class="card-body text-center h6">${totals.critical}</div></div></div>
      <div class="col-4"><div class="card"><div class="card-header h6 bg-warning bg-gradient text-white text-opacity-75">Medium Issues</div><div class="card-body text-center h6">${totals.medium}</div></div></div>
    </div>
  </div></div></div>
  ${pageSectionsHtml}
  <h1 class="mt-5 mb-3"><center>Lighthouse Performance &amp; SEO</center></h1>
  <div class="wrapper-80">${performanceCardsHtml}</div>
</body>
</html>`
}
