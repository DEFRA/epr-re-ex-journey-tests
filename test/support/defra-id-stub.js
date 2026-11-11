import config from '../config/config.js'
import { request } from 'undici'
import { readLoggedInUserIds, trackLoggedInUserId } from './cleanup-tracker.js'

/**
 * Token endpoint response, narrowed to what the tests read. Real Defra ID
 * issues no access token for our scopes, so the id token is the bearer token.
 * @typedef {{
 *   id_token: string
 * }} DefraIdTokenResponse
 */

export class DefraIdStub {
  constructor(baseUrl = config.defraIdUri) {
    this.baseUrl = baseUrl
    this.defaultHeaders = config.apiHeaders
    this.idTokens = new Map()
  }

  async register(payload) {
    const instanceHeaders = { ...this.defaultHeaders }
    const response = await request(
      `${this.baseUrl}/epr-re-ex-defra-id-stub/API/register`,
      {
        method: 'POST',
        headers: instanceHeaders,
        body: payload,
        dispatcher: config.undiciAgent
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
      `${this.baseUrl}/epr-re-ex-defra-id-stub/register/${userId}/relationship`,
      {
        method: 'POST',
        headers: instanceHeaders,
        body: payload,
        dispatcher: config.undiciAgent
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
      `${this.baseUrl}/epr-re-ex-defra-id-stub/authorize?${query}`,
      {
        method: 'GET',
        headers: instanceHeaders,
        dispatcher: config.undiciAgent
      }
    )

    const headers = await response.headers
    return String(headers.location)
  }

  async generateToken(payload, userId) {
    const instanceHeaders = { ...this.defaultHeaders }
    const response = await request(
      `${this.baseUrl}/epr-re-ex-defra-id-stub/token`,
      {
        method: 'POST',
        headers: instanceHeaders,
        body: payload,
        dispatcher: config.undiciAgent
      }
    )
    const responseJson = /** @type {DefraIdTokenResponse} */ (
      await response.body.json()
    )
    this.idTokens.set(userId, responseJson.id_token)
    // Recorded to a shared file, not just the in-memory map: this method runs
    // in whichever worker process happened to run this test, but
    // expireAllUsers() runs once in globalTeardown's own separate process.
    trackLoggedInUserId(userId)
    return responseJson
  }

  authHeader(userId) {
    if (this.idTokens.has(userId)) {
      return { Authorization: 'Bearer ' + this.idTokens.get(userId) }
    } else {
      return {}
    }
  }

  async expireAllUsers() {
    const instanceHeaders = { ...this.defaultHeaders }
    // Read from the shared tracker file, not just this.idTokens: this
    // runs in globalTeardown's own process, which never sees tokens
    // generated in the worker processes that actually ran the tests.
    const userIds = new Set([...readLoggedInUserIds(), ...this.idTokens.keys()])
    for (const userId of userIds) {
      await request(
        `${this.baseUrl}/epr-re-ex-defra-id-stub/API/register/${userId}/expire`,
        {
          method: 'POST',
          headers: instanceHeaders,
          body: '',
          dispatcher: config.undiciAgent
        }
      )
    }
  }
}

export const defraIdStub = new DefraIdStub()
