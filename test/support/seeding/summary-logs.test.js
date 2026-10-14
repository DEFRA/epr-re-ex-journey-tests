import assert from 'node:assert/strict'
import { rm } from 'node:fs/promises'
import { describe, it } from 'node:test'
import ExcelJS from 'exceljs'

import {
  registrationStartYear,
  submitSummaryLogContent,
  summaryLogNumbered
} from './summary-logs.js'

/** @import {ContentPoster} from './summary-logs.js' */

const content = { meta: { MATERIAL: 'Paper_and_board' }, data: {} }
const auth = { Authorization: 'Bearer signed-in' }
const year = 2026

/**
 * A BaseAPI answering every post with the one response, and remembering
 * what it was sent.
 *
 * @param {number} statusCode
 * @param {string} body
 * @returns {{baseAPI: ContentPoster, posts: {endpoint: string, data: string, headers: object}[]}}
 */
function answering(statusCode, body) {
  /** @type {{endpoint: string, data: string, headers: object}[]} */
  const posts = []
  return {
    baseAPI: {
      post: (endpoint, data, headers) => {
        posts.push({ endpoint, data, headers })
        return Promise.resolve({
          statusCode,
          body: {
            json: () => Promise.resolve(JSON.parse(body)),
            text: () => Promise.resolve(body)
          }
        })
      }
    },
    posts
  }
}

describe('registrationStartYear', () => {
  it('defaults to the year seeded organisations start from', () => {
    assert.equal(registrationStartYear(), 2026)
  })

  it('reads the year from a given validFrom', () => {
    assert.equal(registrationStartYear('2025-02-02'), 2025)
  })
})

/**
 * The registration and accreditation numbers on a workbook's cover sheet.
 *
 * @param {string} path
 */
async function coverNumbers(path) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(path)
  const cover = workbook.getWorksheet('Cover')
  return [cover?.getCell('E10').value, cover?.getCell('E13').value]
}

describe('numbering a summary log fixture', () => {
  it('writes a copy carrying the given registration and accreditation numbers', async () => {
    const copy = await summaryLogNumbered('resources/exporter.xlsx', {
      regNumber: 'R26EX1234567890PA',
      accNumber: 'A26EX1234567890PA'
    })

    try {
      assert.deepEqual(await coverNumbers(copy), [
        'R26EX1234567890PA',
        'A26EX1234567890PA'
      ])
    } finally {
      await rm(copy)
    }
  })

  it('leaves a registered-only fixture without an accreditation number', async () => {
    const copy = await summaryLogNumbered('resources/exporter-regonly.xlsx', {
      regNumber: 'R26EX1234567890PA'
    })

    try {
      assert.deepEqual(await coverNumbers(copy), ['R26EX1234567890PA', null])
    } finally {
      await rm(copy)
    }
  })

  it('keeps the whitespace around a fixture number', async () => {
    const copy = await summaryLogNumbered('resources/exporter-invalid.xlsx', {
      regNumber: 'R26EX1234567890PA',
      accNumber: 'A26EX1234567890PA'
    })

    try {
      assert.deepEqual(await coverNumbers(copy), [
        'R26EX1234567890PA\n',
        'A26EX1234567890PA'
      ])
    } finally {
      await rm(copy)
    }
  })

  it('clears the accreditation number of a fixture given none', async () => {
    const copy = await summaryLogNumbered('resources/exporter.xlsx', {
      regNumber: 'R26EX1234567890PA'
    })

    try {
      assert.deepEqual(await coverNumbers(copy), ['R26EX1234567890PA', null])
    } finally {
      await rm(copy)
    }
  })
})

describe('submitting a summary log as content', () => {
  it('posts the content as JSON to the year-scoped dev route and answers with the submitted document', async () => {
    const { baseAPI, posts } = answering(
      200,
      JSON.stringify({ summaryLogId: 'log-1', status: 'submitted' })
    )

    const answer = await submitSummaryLogContent(
      '500001',
      'reg-1',
      auth,
      content,
      year,
      baseAPI
    )

    assert.deepEqual(answer, { summaryLogId: 'log-1', status: 'submitted' })
    assert.deepEqual(posts, [
      {
        endpoint:
          '/v1/dev/organisations/500001/registrations/reg-1/summary-logs/2026',
        data: JSON.stringify(content),
        headers: { ...auth, 'content-type': 'application/json' }
      }
    ])
  })

  it('answers with the invalid document and its validation', async () => {
    const validation = { failures: [{ code: 'INVALID_DATE' }] }
    const { baseAPI } = answering(
      422,
      JSON.stringify({ summaryLogId: 'log-2', status: 'invalid', validation })
    )

    const answer = await submitSummaryLogContent(
      '500001',
      'reg-1',
      auth,
      content,
      year,
      baseAPI
    )

    assert.deepEqual(answer, {
      summaryLogId: 'log-2',
      status: 'invalid',
      validation
    })
  })

  it('stops on any other status, quoting the body as text', async () => {
    const { baseAPI } = answering(502, '<html>Bad Gateway</html>')

    await assert.rejects(
      submitSummaryLogContent('500001', 'reg-1', auth, content, year, baseAPI),
      /expected the submitted or invalid document but got 502\n<html>Bad Gateway<\/html>/
    )
  })

  it('stops on a rejection the route answers without a document', async () => {
    const { baseAPI } = answering(
      422,
      JSON.stringify({ message: 'must hold one value per header' })
    )

    await assert.rejects(
      submitSummaryLogContent('500001', 'reg-1', auth, content, year, baseAPI),
      /answered 422 with neither the submitted nor the invalid document/
    )
  })
})
