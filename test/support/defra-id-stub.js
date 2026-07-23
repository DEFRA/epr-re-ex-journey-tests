import config from '../config/config.js'
import { request } from 'undici'
import { readLoggedInUserIds, trackLoggedInUserId } from './cleanup-tracker.js'

export class DefraIdStub {
  constructor(baseUrl = config.defraIdUri) {
    this.baseUrl = baseUrl
    this.defaultHeaders = config.apiHeaders
    this.accessTokens = new Map()
  }

  async register(payload) {
    const instanceHeaders = { ...this.defaultHeaders }
    const response = await request(
      `${this.baseUrl}/cdp-defra-id-stub/API/register`,
      {
        method: 'POST',
        headers: instanceHeaders,
        body: payload
      }
    )

    return await response.body.json()
  }

  async addRelationship(payload, userId) {
    const instanceHeaders = {
      ...this.defaultHeaders,
      'Content-Type': 'application/x-www-form-urlencoded'
    }

    return await request(
      `${this.baseUrl}/cdp-defra-id-stub/register/${userId}/relationship`,
      {
        method: 'POST',
        headers: instanceHeaders,
        body: payload
      }
    )
  }

  async authorise(payload) {
    const query = Object.entries(payload)
      .map(
        ([key, value]) =>
          `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
      )
      .join('&')

    const instanceHeaders = { ...this.defaultHeaders }
    const response = await request(
      `${this.baseUrl}/cdp-defra-id-stub/authorize?${query}`,
      {
        method: 'GET',
        headers: instanceHeaders
      }
    )

    const headers = await response.headers
    return String(headers.location)
  }

  async generateToken(payload, userId) {
    const instanceHeaders = { ...this.defaultHeaders }
    const response = await request(`${this.baseUrl}/cdp-defra-id-stub/token`, {
      method: 'POST',
      headers: instanceHeaders,
      body: payload
    })
    /**
     * @typedef {Object} AuthResponse
     * @property {string} access_token
     * @property {string} token_type
     * @property {number} expires_in
     */
    const responseJson = /** @type {AuthResponse} */ (
      await response.body.json()
    )
    this.accessTokens.set(userId, responseJson.access_token)
    // Recorded to a shared file, not just the in-memory map: this method runs
    // in whichever worker process happened to run this test, but
    // expireAllUsers() runs once in globalTeardown's own separate process.
    trackLoggedInUserId(userId)
    return responseJson
  }

  authHeader(userId) {
    if (this.accessTokens.has(userId)) {
      return { Authorization: 'Bearer ' + this.accessTokens.get(userId) }
    } else {
      return {}
    }
  }

  async expireAllUsers() {
    const instanceHeaders = { ...this.defaultHeaders }
    // Read from the shared tracker file, not just this.accessTokens: this
    // runs in globalTeardown's own process, which never sees tokens
    // generated in the worker processes that actually ran the tests.
    const userIds = new Set([
      ...readLoggedInUserIds(),
      ...this.accessTokens.keys()
    ])
    for (const userId of userIds) {
      await request(
        `${this.baseUrl}/cdp-defra-id-stub/API/register/${userId}/expire`,
        {
          method: 'POST',
          headers: instanceHeaders,
          body: ''
        }
      )
    }
  }
}

export const defraIdStub = new DefraIdStub()
