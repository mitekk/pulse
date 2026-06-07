import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'
import prettierConfig from 'eslint-config-prettier'

export default defineConfig([
  globalIgnores(['dist', 'node_modules', 'coverage']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      prettierConfig,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],
      // react-refresh: allow inline disable comments for router files
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true, checkJS: false }],
      // setState in effect is fine for one-shot async/sync guards (no external subscription needed)
      'react-hooks/set-state-in-effect': 'off',
      // react-hook-form watch() is a deliberate pattern in its ecosystem
      'react-hooks/incompatible-library': 'off',
    },
  },
])
