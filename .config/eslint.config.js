import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: [
      'node_modules/**',
      '.pnpm-store/**',
      '.runtime/**',
      'dist/**',
      'release/**',
      'vendor/**',
      '*_assets/**',
      'docs/local/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['.config/**/*.{js,mjs,cjs}', 'scripts/**/*.{js,mjs,cjs}', 'tests/**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['tests/browser/**/*.mjs'],
    languageOptions: { globals: globals.browser },
  },
  {
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
      'no-var': 'error',
      'one-var': ['error', 'never'],
      curly: ['error', 'all'],
    },
  },
];
