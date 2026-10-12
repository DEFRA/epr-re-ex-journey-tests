import js from '@eslint/js'
import importX from 'eslint-plugin-import-x'
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
    plugins: { 'import-x': importX },
    rules: {
      'import-x/export': 'error',
      'import-x/first': 'error',
      'import-x/no-absolute-path': [
        'error',
        { esmodule: true, commonjs: true, amd: false }
      ],
      'import-x/no-duplicates': 'error',
      'import-x/no-named-default': 'error',
      'import-x/no-webpack-loader-syntax': 'error'
    }
  },
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
      ],
      curly: ['error', 'all'],
      eqeqeq: ['error', 'always']
    }
  },
  {
    files: ['resources/**/*.js'],
    rules: {
      'no-console': 'off'
    }
  }
]
