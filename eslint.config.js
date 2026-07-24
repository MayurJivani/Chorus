import js from '@eslint/js';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default [
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', '**/*.db', 'apps/server/public/**', '*.ts', '*.tsx', '*.mts', '*.cts'],
  },
  js.configs.recommended,
  {
    files: ['apps/web/**/*.jsx'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.es2022 },
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
    settings: { react: { version: 'detect' } },
  },
  {
    files: ['scripts/**/*.js'],
    languageOptions: {
      globals: { ...globals.node, ...globals.es2022 },
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    rules: {
      'no-console': 'off',
    },
  },
  prettier,
];
