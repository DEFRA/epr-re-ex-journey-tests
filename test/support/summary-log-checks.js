import { expect } from '@playwright/test'
import { UPLOAD_YEAR } from '../page-objects/summary-log-upload-actions.js'

const heading = (page) => page.locator('h1.govuk-heading-xl')

export async function checkOnUploadPage(page, year = UPLOAD_YEAR) {
  await expect(heading(page)).toContainText(
    `Upload your summary log (${year})`,
    { timeout: 10000 }
  )
  await expect(page).toHaveTitle(
    new RegExp(`Summary log: upload \\(${year}\\)`)
  )
}

export async function checkOnCheckPage(page, year = UPLOAD_YEAR) {
  await expect(heading(page)).toContainText(
    `Upload your summary log (${year})`,
    { timeout: 30000 }
  )
  await expect(page).toHaveTitle(
    new RegExp(`Upload your summary log \\(${year}\\)`)
  )
}
