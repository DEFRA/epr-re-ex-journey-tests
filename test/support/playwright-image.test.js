import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { playwrightImageMismatch } from './playwright-image.js'

const dockerfile = (tag) =>
  `# base image\nFROM mcr.microsoft.com/playwright:${tag}\nCOPY . .\n`

describe('playwrightImageMismatch', () => {
  it('reports nothing when the image matches the package version', () => {
    assert.equal(
      playwrightImageMismatch(dockerfile('v1.65.1-noble'), '1.65.1'),
      undefined
    )
  })

  it('names both versions when the image is behind', () => {
    assert.equal(
      playwrightImageMismatch(dockerfile('v1.65.0-noble'), '1.65.1'),
      'Dockerfile playwright image is 1.65.0 but @playwright/test is 1.65.1'
    )
  })

  it('fails when the Dockerfile has no playwright image', () => {
    assert.equal(
      playwrightImageMismatch('FROM node:24\n', '1.65.1'),
      'Dockerfile has no mcr.microsoft.com/playwright image to compare'
    )
  })

  it('fails when the package version is missing', () => {
    assert.equal(
      playwrightImageMismatch(dockerfile('v1.65.1-noble'), undefined),
      'package.json has no @playwright/test version to compare'
    )
  })
})
