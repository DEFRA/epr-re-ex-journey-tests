import js from '@eslint/js'
import neostandard from 'neostandard'

const ECMA_VERSION = 2025

// neostandard pins ecmaVersion 2022, which rejects v-flag regexes and import
// attributes: https://github.com/neostandard/neostandard/issues/307
const withEcmaVersion = (config) =>
  config.languageOptions?.ecmaVersion < ECMA_VERSION
    ? {
        ...config,
        languageOptions: {
          ...config.languageOptions,
          ecmaVersion: ECMA_VERSION
        }
      }
    : config

export default [
  js.configs.recommended,
  ...neostandard({
    env: ['node'],
    ignores: [...neostandard.resolveIgnoresFromGitignore(), 'docker'],
    noJsx: true,
    noStyle: true
  }).map(withEcmaVersion),
  {
    rules: {
      'no-console': 'error',
      camelcase: [
        'error',
        {
          allow: [
            '^faker[A-Z]{2}_[A-Z]{2}$',
            '^page_location$',
            '^page_referrer$'
          ]
        }
      ]
    }
  },
  {
    files: ['resources/**/*.mjs'],
    rules: {
      'no-console': 'off'
    }
  }
]
