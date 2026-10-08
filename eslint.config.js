import neostandard from 'neostandard'

export default [
  ...neostandard({
    env: ['node'],
    ignores: ['allure-results', 'allure-report', 'docker'],
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
