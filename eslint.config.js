import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'playwright-report/**', 'test-results/**', 'data/**', 'docs/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Server, scripts and unit tests (Node)
    files: ['server.js', 'lib/**/*.js', 'scripts/**/*.js', 'tests/unit/**/*.js', '*.config.js'],
    languageOptions: { globals: globals.node },
  },
  {
    // Browser app
    files: ['**/*.tsx', 'context/**/*.ts', 'services/**/*.ts', 'utils/**/*.ts', 'types.ts'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'off',
    },
  },
  {
    files: ['tests/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true, caughtErrors: 'none' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
);
