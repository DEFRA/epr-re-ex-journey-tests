import { copyFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
)

// Allure's CLI auto-detects a categories.json placed alongside the raw
// results and uses it to classify failures on the report's Categories tab -
// copy our static definitions in before every `allure generate` so
// accessibility failures land under their own "Accessibility violations"
// category instead of the generic "Product defects" bucket.
export async function copyAllureCategories(resultsDir = 'allure-results') {
  const target = path.resolve(resultsDir)
  await mkdir(target, { recursive: true })
  await copyFile(
    path.join(projectRoot, 'allure-categories.json'),
    path.join(target, 'categories.json')
  )
}
