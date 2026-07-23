import { defineConfig } from '@playwright/test'
import { ProxyAgent, setGlobalDispatcher } from 'undici'
import { bootstrap } from 'global-agent'
import baseConfig from './playwright.config.js'

// Enable the outbound proxy so the test suite can talk to BrowserStack from
// behind CDP Portal's network.
const proxyUrl = process.env.HTTP_PROXY
if (proxyUrl) {
  setGlobalDispatcher(new ProxyAgent({ uri: proxyUrl }))
  bootstrap()
  globalThis.GLOBAL_AGENT.HTTP_PROXY = proxyUrl
}

export default defineConfig({
  ...baseConfig
})
