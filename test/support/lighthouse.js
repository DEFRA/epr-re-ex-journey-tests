import { chromium } from '@playwright/test'
import { launch } from 'chrome-launcher'
import lighthouse, { desktopConfig } from 'lighthouse'
import { attachment } from 'allure-js-commons'

const LIGHTHOUSE_CATEGORIES = ['accessibility', 'performance', 'seo']

// Lighthouse 13 replaced several of the audits below with "insight" audits
// covering the same ground under a new id (e.g. render-blocking-resources ->
// render-blocking-insight; modern-image-formats/uses-optimized-images/
// uses-responsive-images collapsed into image-delivery-insight). An id that
// no longer exists in lhr.audits is silently dropped by pickDiagnostics
// below, so this list must be kept in sync with whatever version of
// `lighthouse` is installed.
const PERFORMANCE_DIAGNOSTIC_AUDIT_IDS = [
  'image-delivery-insight',
  'render-blocking-insight',
  'unused-javascript',
  'unused-css-rules',
  'mainthread-work-breakdown',
  'total-byte-weight'
]

// Playwright runs the journey at a fixed 1920x1080 desktop window (see
// playwright.config.js), but Lighthouse defaults to mobile emulation. Left
// unset, the two halves of the accessibility/performance report would
// describe different renderings of the page.
const LIGHTHOUSE_CONFIG = {
  ...desktopConfig,
  settings: {
    ...desktopConfig.settings,
    screenEmulation: {
      ...desktopConfig.settings.screenEmulation,
      width: 1920,
      height: 1080
    }
  }
}

let chromeInstance

// Lighthouse audits a page by opening a new tab in its own Chrome process
// and navigating it to the URL itself - it never touches Playwright's page
// or context, so it can't disturb the wizard flow being tested. It's
// pointed at the exact Chromium build Playwright already downloaded (rather
// than relying on a system-wide `google-chrome`, which the CI image doesn't
// have) so this works unmodified wherever Playwright itself already runs.
async function getChromeInstance() {
  if (!chromeInstance) {
    const proxyServer = process.env.HTTP_PROXY
    chromeInstance = await launch({
      chromePath: chromium.executablePath(),
      chromeFlags: [
        '--headless=new',
        '--no-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--ignore-certificate-errors',
        ...(proxyServer ? [`--proxy-server=${proxyServer}`] : [])
      ]
    })
  }
  return chromeInstance
}

/**
 * Closes the shared Lighthouse Chrome instance, if one was launched during
 * the run. Call once per spec file (e.g. from a `test.afterAll` hook) so
 * the process doesn't linger once the last audit is done.
 */
export async function closeLighthouseChrome() {
  if (chromeInstance) {
    await chromeInstance.kill()
    chromeInstance = undefined
  }
}

// Lighthouse's `extraHeaders` are attached to every request its audit makes
// - including any cross-origin ones (e.g. a webfont CDN) - there's no way to
// scope them to same-origin only. That's an accepted trade-off of the
// cookie-header technique Lighthouse's own docs recommend for auditing
// authenticated pages; it's fine here as the app under test serves its own
// assets rather than pulling from third parties.
async function buildCookieHeader(page, url) {
  const cookies = await page.context().cookies(url)
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ')
}

function pickDiagnostics(lhr) {
  return PERFORMANCE_DIAGNOSTIC_AUDIT_IDS.map((id) => lhr.audits[id]).filter(
    (audit) => audit && audit.score !== 1
  )
}

function buildPerformanceMetrics(pageName, url, lhr) {
  const audits = lhr.audits
  const categories = lhr.categories

  return {
    pageName,
    url,
    generatedTime: lhr.fetchTime,
    formFactor: lhr.configSettings.formFactor,
    throttling: lhr.configSettings.throttlingMethod,
    performance: {
      score: categories.performance?.score ?? null,
      fcp: audits['first-contentful-paint'],
      lcp: audits['largest-contentful-paint'],
      tbt: audits['total-blocking-time'],
      cls: audits['cumulative-layout-shift'],
      speedIndex: audits['speed-index'],
      tti: audits.interactive,
      ttfb: audits['server-response-time'] || audits['time-to-first-byte'],
      domSize: audits['dom-size-insight'],
      totalBytes: audits['total-byte-weight'],
      jsExecution: audits['bootup-time']
    },
    accessibility: { score: categories.accessibility?.score ?? null },
    seo: { score: categories.seo?.score ?? null },
    diagnostics: pickDiagnostics(lhr)
  }
}

/**
 * Runs a Lighthouse audit (accessibility, performance & SEO categories)
 * against the page's current URL, authenticated with the same session
 * cookies Playwright is using, in Lighthouse's own separate headless Chrome
 * tab. Returns null (and attaches a warning to Allure) rather than
 * throwing, so a Lighthouse hiccup can't fail an accessibility test that's
 * really asserting on the Axe scan.
 *
 * Because Lighthouse must do a fresh navigation (unlike Axe, which scans
 * the live DOM in place), a page reached via a POST without a
 * redirect-to-GET afterwards may not reload identically - that's an
 * inherent limitation of audit-by-reload, not something this can paper
 * over.
 * @param {import('@playwright/test').Page} page
 * @param {string} pageName
 */
export async function runLighthouseAudit(page, pageName) {
  const url = page.url()

  try {
    const chrome = await getChromeInstance()
    const cookieHeader = await buildCookieHeader(page, url)

    const result = await lighthouse(
      url,
      {
        logLevel: 'error',
        output: 'json',
        onlyCategories: LIGHTHOUSE_CATEGORIES,
        port: chrome.port,
        extraHeaders: cookieHeader ? { Cookie: cookieHeader } : undefined
      },
      LIGHTHOUSE_CONFIG
    )

    if (!result) {
      throw new Error('Lighthouse returned no result')
    }

    // Some pages (e.g. a one-time "created"/"issued" flash confirmation)
    // clear their session flag as soon as they're read, then redirect on any
    // subsequent GET. Playwright's own navigation already consumed the
    // flash, so Lighthouse's fresh re-navigation to the same URL can land
    // on a different page than the one it's meant to audit. Rather than
    // silently mislabel that page's report, skip it.
    if (result.lhr.finalDisplayedUrl !== url) {
      await attachment(
        `Lighthouse audit skipped: ${pageName}`,
        `Requested ${url} but Lighthouse was redirected to ${result.lhr.finalDisplayedUrl} - likely a one-time page (e.g. a flash confirmation) already consumed by an earlier navigation. Skipping this audit rather than mislabeling the redirected page.`,
        'text/plain'
      )
      return null
    }

    return {
      pageName,
      url,
      lhr: result.lhr,
      metrics: buildPerformanceMetrics(pageName, url, result.lhr)
    }
  } catch (error) {
    await attachment(
      `Lighthouse audit failed: ${pageName}`,
      `${error.stack || error.message}`,
      'text/plain'
    )
    // The error may mean the shared Chrome process itself died, in which
    // case every remaining audit in this worker would otherwise keep
    // failing silently against a dead instance. Drop it so the next call
    // relaunches a fresh one.
    if (chromeInstance) {
      const deadInstance = chromeInstance
      chromeInstance = undefined
      await deadInstance.kill().catch(() => {})
    }
    return null
  }
}
