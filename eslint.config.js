import js from '@eslint/js'
import neostandard from 'neostandard'

export default [
  js.configs.recommended,
  ...neostandard({
    env: ['node'],
    ignores: [...neostandard.resolveIgnoresFromGitignore(), 'docker'],
    noJsx: true,
    noStyle: true
  }),
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
