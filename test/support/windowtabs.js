import { browser } from '@wdio/globals'

export async function switchToNewTabAndClosePreviousTab() {
  const originalWindow = await browser.getWindowHandle()

  await browser.waitUntil(
    async () => (await browser.getWindowHandles()).length === 2,
    { timeout: 5000, timeoutMsg: 'New tab did not open' }
  )

  const handles = await browser.getWindowHandles()
  const newWindow = handles.find((handle) => handle !== originalWindow)
  if (!newWindow) {
    throw new Error('New window handle not found')
  }
  await browser.switchToWindow(newWindow)

  // Now switch back to original tab to close it
  await browser.switchToWindow(originalWindow)
  await browser.closeWindow()

  // Switch back to the new tab (now the only one)
  await browser.switchToWindow(newWindow)
}

export async function switchToNewTab() {
  const originalWindow = await browser.getWindowHandle()

  await browser.waitUntil(
    async () => (await browser.getWindowHandles()).length === 2,
    { timeout: 5000, timeoutMsg: 'New tab did not open' }
  )

  const handles = await browser.getWindowHandles()
  const newWindow = handles.find((handle) => handle !== originalWindow)
  if (!newWindow) {
    throw new Error('New window handle not found')
  }
  await browser.switchToWindow(newWindow)

  return originalWindow
}

export async function closeCurrentTabAndReturn(originalWindow) {
  await browser.closeWindow()
  await browser.switchToWindow(originalWindow)
}
