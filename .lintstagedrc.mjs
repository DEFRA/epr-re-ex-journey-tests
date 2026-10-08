export default {
  '*.{js,cjs,mjs,json,md}': 'prettier --write',
  '**/*.{js,cjs,mjs}': ['npm run lint:fix'],
  '*': () => 'gitleaks protect --staged --no-banner --verbose'
}
