import { Agent, ProxyAgent } from 'undici'
import { CognitoAuth } from '../support/cognito-auth.js'
import { CognitoStub } from '../support/cognito-stub.js'

/**
 * @typedef {{
 *   url: string,
 *   clientId: string,
 *   username: string,
 *   password: string
 * }} CognitoAuthConfig
 */

const environment = process.env.ENVIRONMENT
const withProxy = process.env.WITH_PROXY
const xApiKey = process.env.X_API_KEY

if (environment === 'prod') {
  throw new Error(
    'The test suite is not meant to be run against the prod Environment!'
  )
}

// TODO: point these at whichever service(s) this repo ends up exercising.
// `epr-backend` is the current live Re/Ex API - update if/when it's replaced.
const api = {
  local: withProxy ? 'http://epr-backend:3001' : 'http://localhost:3001',
  env: `https://epr-backend.${environment}.cdp-int.defra.cloud`,
  envFromLocal: `https://ephemeral-protected.api.${environment}.cdp-int.defra.cloud/epr-backend`,
  headers: xApiKey ? { 'x-api-key': xApiKey } : {}
}

// Entra (service-to-service) auth, used for calling the backend as the
// EA/regulator identity rather than as a Defra ID operator user.
const auth = {
  local: withProxy
    ? 'http://epr-re-ex-entra-stub:3010'
    : 'http://localhost:3010',
  env:
    environment === 'test'
      ? 'https://login.microsoftonline.com/6f504113-6b64-43f2-ade9-242e05780007/oauth2/v2.0/token'
      : `https://epr-re-ex-entra-stub.${environment}.cdp-int.defra.cloud`,
  // Below configuration only applies for the "Test" environment
  clientSecret: process.env.AUTH_CLIENT_SECRET,
  clientId: 'bd06da51-53f6-46d0-a9f0-ac562864c887',
  username: process.env.AUTH_USERNAME,
  password: process.env.AUTH_PASSWORD,
  scope: 'api://bd06da51-53f6-46d0-a9f0-ac562864c887/.default',
  grantType: 'password'
}

const defraId = {
  local: 'http://defra-id-stub:3200',
  env: `https://cdp-defra-id-stub.${environment}.cdp-int.defra.cloud`
}

// epr-re-ex-admin-frontend runs on its own port/host, separate from the
// epr-frontend app the global wdio baseUrl points at - admin page objects
// build absolute URLs from this rather than relying on baseUrl.
const admin = {
  local: 'http://localhost:3002',
  env: `https://epr-re-ex-admin-frontend.${environment}.cdp-int.defra.cloud`
}

// Cognito auth for the external/regulator-facing API (e.g. PRN accept/reject),
// which sits behind AWS Cognito rather than Defra ID or Entra.
const cognitoAuthParams = {
  url: withProxy ? 'http://cognito-stub:9229' : 'http://localhost:9229',
  envUrl: process.env.COGNITO_URL,
  clientId:
    environment === 'test'
      ? process.env.COGNITO_CLIENT_ID
      : '5357lgchj0h0fuomqyas5r87u',
  username: 'hello@example.com',
  password:
    environment === 'test' ? process.env.COGNITO_CLIENT_SECRET : 'testPassword'
}

const cognito = {
  local: new CognitoStub(cognitoAuthParams),
  env: new CognitoAuth(cognitoAuthParams)
}

const proxy = process.env.HTTP_PROXY
  ? new ProxyAgent({
      uri: process.env.HTTP_PROXY,
      keepAliveTimeout: 10,
      keepAliveMaxTimeout: 10
    })
  : new ProxyAgent({
      uri: 'http://localhost:7777',
      proxyTunnel: !!environment,
      requestTls: {
        rejectUnauthorized: false
      }
    })

const agent = new Agent({
  connections: 10,
  pipelining: 0,
  headersTimeout: 30000,
  bodyTimeout: 30000
})

const globalUndiciAgent = environment ? proxy : agent

let apiUri
let authUri
let defraIdUri
let adminUri
let cognitoAuth

if (!environment) {
  apiUri = api.local
  authUri = auth.local
  defraIdUri = defraId.local
  adminUri = admin.local
  cognitoAuth = cognito.local
} else {
  apiUri = api.env
  authUri = auth.env
  defraIdUri = defraId.env
  adminUri = admin.env
  cognitoAuth = cognito.env
}

if (xApiKey) {
  apiUri = api.envFromLocal
}

export default {
  apiHeaders: api.headers,
  apiUri,
  auth,
  authUri,
  adminUri,
  cognitoAuth,
  defraIdUri,
  undiciAgent: globalUndiciAgent
}
