export default {
  '*.{js,mjs,json,md}': 'prettier --write',
  '**/*.{js,mjs}': ['npm run lint:fix'],
  '*': () => 'gitleaks protect --staged --no-banner --verbose'
}
