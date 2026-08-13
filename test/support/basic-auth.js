import config from '../config/config.js'
import { requireValue } from './required-value.js'

export class BasicAuth {
  async defaultBasicAuthHeader() {
    const username = requireValue(
      config.basicAuth.username,
      'BASIC_AUTH_USERNAME'
    )
    const password = requireValue(
      config.basicAuth.password,
      'BASIC_AUTH_PASSWORD'
    )

    this.authorisationHeader = Buffer.from(`${username}:${password}`).toString(
      'base64'
    )
  }

  async generateAuthHeader(username, password) {
    this.authorisationHeader = Buffer.from(`${username}:${password}`).toString(
      'base64'
    )
  }

  authHeader() {
    if (this.authorisationHeader) {
      return { Authorization: 'Basic ' + this.authorisationHeader }
    } else {
      return {}
    }
  }
}
