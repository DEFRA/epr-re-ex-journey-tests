export default {
  '*.{js,mjs,json,md}': 'prettier --write',
  '**/*.{js,mjs}': 'eslint --fix --max-warnings 0',
  '*': () => 'gitleaks protect --staged --no-banner --verbose'
}
