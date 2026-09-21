import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { submitSummaryLogContent } from './summary-logs.js'

/** @import {ContentPoster} from './summary-logs.js' */

const content = { meta: { MATERIAL: 'Paper_and_board' }, data: {} }
const auth = { Authorization: 'Bearer signed-in' }

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

describe('submitting a summary log as content', () => {
  it('posts the content as JSON to the dev route and answers with the submitted document', async () => {
    const { baseAPI, posts } = answering(
      200,
      JSON.stringify({ summaryLogId: 'log-1', status: 'submitted' })
    )

    const answer = await submitSummaryLogContent(
      '500001',
      'reg-1',
      auth,
      content,
      baseAPI
    )

    assert.deepEqual(answer, { summaryLogId: 'log-1', status: 'submitted' })
    assert.deepEqual(posts, [
      {
        endpoint:
          '/v1/dev/organisations/500001/registrations/reg-1/summary-logs',
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
      submitSummaryLogContent('500001', 'reg-1', auth, content, baseAPI),
      /expected the submitted or invalid document but got 502\n<html>Bad Gateway<\/html>/
    )
  })

  it('stops on a rejection the route answers without a document', async () => {
    const { baseAPI } = answering(
      422,
      JSON.stringify({ message: 'must hold one value per header' })
    )

    await assert.rejects(
      submitSummaryLogContent('500001', 'reg-1', auth, content, baseAPI),
      /answered 422 with neither the submitted nor the invalid document/
    )
  })
})
