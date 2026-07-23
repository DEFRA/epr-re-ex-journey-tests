module.exports = {
  env: {
    es2022: true,
    node: true,
    jest: true
  },
  extends: ['standard', 'prettier', 'eslint:recommended'],
  overrides: [],
  parserOptions: {
    ecmaVersion: 'latest'
  },
  plugins: ['prettier'],
  rules: {
    'prettier/prettier': 'error',
    'no-console': 'error',
    camelcase: [
      'error',
      {
        allow: ['^faker[A-Z]{2}_[A-Z]{2}$']
      }
    ]
  }
}
