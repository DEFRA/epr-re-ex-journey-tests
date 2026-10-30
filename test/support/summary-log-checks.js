import { expect } from '@playwright/test'
import { UPLOAD_YEAR } from '../page-objects/summary-log-upload-actions.js'

const heading = (page) => page.locator('h1.govuk-heading-xl')

export async function checkOnUploadPage(page) {
  await expect(heading(page)).toContainText(
    `Upload your summary log (${UPLOAD_YEAR})`,
    { timeout: 10000 }
  )
  await expect(page).toHaveTitle(
    new RegExp(`Summary log: upload \\(${UPLOAD_YEAR}\\)`)
  )
}

export async function checkOnCheckPage(page) {
  await expect(heading(page)).toContainText(
    `Upload your summary log (${UPLOAD_YEAR})`,
    { timeout: 30000 }
  )
  await expect(page).toHaveTitle(
    new RegExp(`Upload your summary log \\(${UPLOAD_YEAR}\\)`)
  )
}
