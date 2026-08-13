import config from '../config/config.js'
import { FormData, request } from 'undici'
import { requireValue } from './required-value.js'

export class AuthClient {
  constructor(baseUrl = config.authUri) {
    this.baseUrl = baseUrl
    this.defaultHeaders = config.apiHeaders
  }

  async authenticate() {
    let payload, urlSuffix
    if (config.usesRealEntra) {
      payload = new FormData()
      payload.append('client_id', config.auth.clientId)
      payload.append(
        'client_secret',
        requireValue(config.auth.clientSecret, 'AUTH_CLIENT_SECRET')
      )
      payload.append(
        'username',
        requireValue(config.auth.username, 'AUTH_USERNAME')
      )
      payload.append(
        'password',
        requireValue(config.auth.password, 'AUTH_PASSWORD')
      )
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
