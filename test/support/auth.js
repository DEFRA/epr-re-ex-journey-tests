import config from '../config/config.js'
import { FormData, request } from 'undici'
import { requireValue } from './required-value.js'

export class AuthClient {
  constructor(baseUrl = config.authUri) {
    this.baseUrl = baseUrl
    this.defaultHeaders = config.apiHeaders
  }

  async authenticate() {
    await this.#signIn({
      username: config.auth.username,
      password: config.auth.password,
      usernameVariable: 'AUTH_USERNAME',
      passwordVariable: 'AUTH_PASSWORD'
    })
  }

  /**
   * Signs in as the regulator standard user, whose credential carries the
   * regulator scope bundle alone. The service identity `authenticate` uses is
   * on the service maintainer email lists, so it reaches the backend as an
   * admin and cannot stand in for a regulator.
   */
  async authenticateAsRegulator() {
    await this.#signIn({
      username: config.regulatorUser.username,
      password: config.regulatorUser.password,
      usernameVariable: 'REGULATOR_USERNAME',
      passwordVariable: 'REGULATOR_PASSWORD'
    })
  }

  async #signIn({ username, password, usernameVariable, passwordVariable }) {
    let payload, urlSuffix
    if (config.usesRealEntra) {
      payload = new FormData()
      payload.append('client_id', config.auth.clientId)
      payload.append(
        'client_secret',
        requireValue(config.auth.clientSecret, 'AUTH_CLIENT_SECRET')
      )
      payload.append('username', requireValue(username, usernameVariable))
      payload.append('password', requireValue(password, passwordVariable))
      payload.append('scope', config.auth.scope)
      payload.append('grant_type', config.auth.grantType)
      urlSuffix = ''
    } else {
      payload = JSON.stringify({ clientId: 'clientId', username })
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
