const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  { ignores: ['node_modules/**', 'data/**', 'coverage/**'] },
  js.configs.recommended,
  {
    files: ['src/**/*.js', 'scripts/**/*.js', 'test/**/*.js', 'eslint.config.js'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
  },
  {
    files: ['public/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: { ...globals.browser, ...globals.serviceworker },
    },
  },
  { files: ['scripts/check*browser.js'], languageOptions: { globals: globals.browser } },
  {
    rules: {
      'no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', ignoreRestSiblings: true, caughtErrors: 'none' },
      ],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
];
