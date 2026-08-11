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
const withoutLogs = process.env.WITHOUT_LOGS

if (environment === 'prod') {
  throw new Error(
    'The test suite is not meant to be run against the prod Environment!'
  )
}

// `epr-backend` is the one Re/Ex API all three apps under test (epr-frontend,
// epr-re-ex-admin-frontend, and epr-backend itself) share - confirmed by
// compose.yml, every wdio baseUrl, and the CI wiring all pointing at it
// consistently. Update if it's ever replaced.
//
// WITH_PROXY selects the container-network hostname instead of localhost.
// This isn't for host-side DNS resolution (that's what the removed
// /etc/hosts step used to be for, and why STUB_INTERNAL_URL now fixes the
// JWT issuer regardless of hostname) - it's because mitmproxy forwards a
// proxied request by resolving the target hostname *itself*, from inside
// the docker network it's attached to. Given `localhost`, mitmproxy resolves
// its own loopback (502 Bad Gateway); it can only reach the stubs by their
// compose network alias. Hostnames confirmed via `docker inspect` against
// the actual local dev stack (epr-re-ex-service's compose.yml) - note
// `entra-stub`, not `epr-re-ex-entra-stub` as this repo's own compose.yml
// (CI-only) names it.
const api = {
  local: withProxy
    ? 'http://epr-backend:3001'
    : `http://localhost:${process.env.BACKEND_PORT || 3001}`,
  env: `https://epr-backend.${environment}.cdp-int.defra.cloud`,
  envFromLocal: `https://ephemeral-protected.api.${environment}.cdp-int.defra.cloud/epr-backend`,
  headers: xApiKey ? { 'x-api-key': xApiKey } : {}
}

// `test` and `ext-test` authenticate against real Entra; every other
// environment, and local, uses the Entra stub. The two differ in more than a
// URL - the token request and the sign-in page have different shapes - so
// everything that picks between them reads this one constant. Exported for
// the same reason: `test/support/auth.js` and the admin login page object
// must make the same choice this file does.
const usesRealEntra = environment === 'test' || environment === 'ext-test'

// Entra (service-to-service) auth, used for calling the backend as the
// EA/regulator identity rather than as a Defra ID operator user.
const auth = {
  local: withProxy
    ? 'http://entra-stub:3010'
    : `http://localhost:${process.env.ENTRA_STUB_PORT || 3010}`,
  env: usesRealEntra
    ? 'https://login.microsoftonline.com/6f504113-6b64-43f2-ade9-242e05780007/oauth2/v2.0/token'
    : `https://epr-re-ex-entra-stub.${environment}.cdp-int.defra.cloud`,
  // The credentials below come from portal-side secrets against real Entra,
  // and are the stub's fixed values otherwise.
  clientSecret: process.env.AUTH_CLIENT_SECRET,
  clientId: 'bd06da51-53f6-46d0-a9f0-ac562864c887',
  username: usesRealEntra ? process.env.AUTH_USERNAME : 'ea@test.gov.uk',
  password: usesRealEntra ? process.env.AUTH_PASSWORD : 'pass',
  scope: 'api://bd06da51-53f6-46d0-a9f0-ac562864c887/.default',
  grantType: 'password'
}

const defraId = {
  local: withProxy
    ? 'http://defra-id-stub:3200'
    : `http://localhost:${process.env.DEFRA_ID_STUB_PORT || 3200}`,
  env: `https://epr-re-ex-defra-id-stub.${environment}.cdp-int.defra.cloud`
}

// Basic-auth credentials for the external/basic-auth-secured endpoints
// (org-by-ID, overseas-sites-by-ID) - matches compose.yml's
// BASIC_AUTH_USERNAME/PASSWORD on epr-backend.
const basicAuth = {
  username:
    environment === 'test'
      ? process.env.BASIC_AUTH_USERNAME
      : 'basicAuthUsername',
  password:
    environment === 'test'
      ? process.env.BASIC_AUTH_PASSWORD
      : 'basicAuthPassword'
}

// epr-re-ex-admin-frontend runs on its own port/host, separate from the
// epr-frontend app the global wdio baseUrl points at - admin page objects
// build absolute URLs from this rather than relying on baseUrl.
const admin = {
  local: `http://localhost:${process.env.ADMIN_PORT || 3002}`,
  env: `https://epr-re-ex-admin-frontend.${environment}.cdp-int.defra.cloud`
}

// Cognito auth for the external/regulator-facing API (e.g. PRN accept/reject),
// which sits behind AWS Cognito rather than Defra ID or Entra.
const cognitoAuthParams = {
  url: withProxy
    ? 'http://cognito-stub:9229'
    : `http://localhost:${process.env.COGNITO_PORT || 9229}`,
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

const globalUndiciAgent = environment || withProxy ? proxy : agent

// `docker logs` is only reachable against the local compose stack - there's
// no equivalent for a deployed environment, so log/audit-log assertions are
// skipped there (and can be force-disabled locally via WITHOUT_LOGS).
const dockerLogParser = {
  containerName: 'epr-backend'
}

const testLogs = !withoutLogs && !environment

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
  basicAuth,
  cognitoAuth,
  defraIdUri,
  dockerLogParser,
  testLogs,
  undiciAgent: globalUndiciAgent,
  usesRealEntra
}
