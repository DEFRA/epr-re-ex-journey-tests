import { chromium } from '@playwright/test'

const browser = await chromium.launch()
await browser.close()
