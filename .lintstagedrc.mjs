export default {
  '*.{js,cjs,json,md}': 'prettier --write',
  '**/*.{js,cjs}': ['npm run lint:fix'],
  '*': () => 'gitleaks protect --staged --no-banner --verbose'
}
