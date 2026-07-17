import config from '../config/config.js'
import { FormData, request } from 'undici'

export class AuthClient {
  constructor(baseUrl = config.authUri) {
    this.baseUrl = baseUrl
    this.defaultHeaders = config.apiHeaders
  }

  async authenticate() {
    let payload, urlSuffix
    if (process.env.ENVIRONMENT === 'test') {
      payload = new FormData()
      payload.append('client_id', config.auth.clientId)
      payload.append('client_secret', config.auth.clientSecret)
      payload.append('username', config.auth.username)
      payload.append('password', config.auth.password)
      payload.append('scope', config.auth.scope)
      payload.append('grant_type', config.auth.grantType)
      urlSuffix = ''
    } else {
      const clientId = 'clientId'
      const username = 'ea@test.gov.uk'
      payload = JSON.stringify({ clientId, username })
      urlSuffix = '/sign'
    }
    await this.generateToken(payload, urlSuffix)
  }

  async generateToken(payload, suffix) {
    const instanceHeaders = { ...this.defaultHeaders }
    const response = await request(`${this.baseUrl}${suffix}`, {
      method: 'POST',
      headers: instanceHeaders,
      body: payload,
      dispatcher: config.undiciAgent
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
    this.accessToken = responseJson.access_token
  }

  authHeader() {
    if (this.accessToken) {
      return { Authorization: 'Bearer ' + this.accessToken }
    } else {
      return {}
    }
  }
}
