export default {
  '*.{js,mjs,json,md}': 'prettier --write',
  '**/*.js': ['npm run lint:fix'],
  '*': () => 'gitleaks protect --staged --no-banner --verbose'
}
