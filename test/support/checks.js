import { expect } from '@playwright/test'

export async function checkBodyText(page, message, timeoutInSeconds) {
  await expect
    .poll(() => page.locator('body').innerText(), {
      timeout: timeoutInSeconds * 1000
    })
    .toContain(String(message))
}

export async function checkBodyTextDoesNotInclude(
  page,
  message,
  timeoutInSeconds
) {
  await expect
    .poll(() => page.locator('body').innerText(), {
      timeout: timeoutInSeconds * 1000
    })
    .not.toContain(String(message))
}

export async function checkUploadErrorText(
  page,
  selector,
  message,
  timeoutInSeconds
) {
  await expect
    .poll(() => page.locator(selector).innerText(), {
      timeout: timeoutInSeconds * 1000
    })
    .toContain(message)
}
