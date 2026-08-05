import { FlatCompat } from '@eslint/eslintrc';
import js from '@eslint/js';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import reactPlugin from 'eslint-plugin-react';
import simpleImportSortPlugin from 'eslint-plugin-simple-import-sort';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import unicornPlugin from 'eslint-plugin-unicorn';
import a11yPlugin from 'eslint-plugin-jsx-a11y';
import playwrightPlugin from 'eslint-plugin-playwright';
import prettierConfig from 'eslint-config-prettier';

// For compatibility with some plugins that haven't migrated to flat config
const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
});

const config = [
  // Ignores
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/coverage/**',
      '**/public/**',
      '**/.git/**',
      '**/.husky/**',
      '**/.vscode/**',
      '**/package-lock.json',
      '**/pnpm-lock.yaml',
    ],
  },

  // Base JS config
  js.configs.recommended,

  // TypeScript config
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        React: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      // The base rule misreads TypeScript-only constructs — it flags the
      // parameter names in a function type alias (`type H = (msg: string) =>
      // void`) as unused variables. typescript-eslint's documented guidance is
      // to disable it and rely on the TS-aware version below.
      'no-unused-vars': 'off',
      // Likewise: `no-undef` has no view of TypeScript's lib types, so it
      // reports built-ins like `Transferable` as undefined globals. tsc already
      // catches genuinely undefined identifiers, and typescript-eslint
      // recommends turning this off in TypeScript files for that reason.
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-empty-interface': 'error',
      '@typescript-eslint/no-empty-function': 'warn',
    },
  },

  // React config
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    plugins: {
      react: reactPlugin,
    },
    rules: {
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react/display-name': 'off',
      'react/jsx-curly-brace-presence': [
        'error',
        { props: 'never', children: 'never' },
      ],
      'react/self-closing-comp': ['error', { component: true, html: true }],
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
  },

  // React Hooks config
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    plugins: {
      'react-hooks': reactHooksPlugin,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  // Next.js config
  ...compat.config({
    extends: ['next/core-web-vitals'],
    parserOptions: {
      requireConfigFile: false,
    },
  }),
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    rules: {
      '@next/next/no-img-element': 'off',
      '@next/next/no-page-custom-font': 'off',
      '@next/next/no-duplicate-head': 'off',
    },
  },

  // Simple import sort config
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    plugins: {
      'simple-import-sort': simpleImportSortPlugin,
    },
    rules: {
      'simple-import-sort/imports': [
        'error',
        {
          groups: [
            // 1. `react` and `next` related packages come first
            ['^react(-|\\/|$)', '^next(-|\\/|$)', '^@next(-|\\/|$)'],
            // 2. Other third-party packages
            ['^@?\\w'],
            // 3. `@/ui` imports
            ['^@/ui(-|\\/|$)'],
            // 4. `@/components` imports
            ['^@/components'],
            // 5. `@/lib` imports
            ['^@/lib'],
            // 6. `@assets` imports
            ['^@assets(-|\\/|$)'],
            // 7. Other absolute imports
            ['^@/'],
            // 8. Relative imports
            ['^\\.'],
            // 9. Style imports
            ['^.+\\.s?css$'],
            // 10. Side effect imports
            ['^\\u0000'],
          ],
        },
      ],
      'simple-import-sort/exports': 'error',
      'sort-imports': 'off',
      'import/order': 'off',
    },
  },

  // Accessibility config
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    plugins: {
      'jsx-a11y': a11yPlugin,
    },
    rules: {
      'jsx-a11y/alt-text': 'off', // Handled by Next.js Image component
      'jsx-a11y/heading-has-content': 'off', // Allow empty headings
      'jsx-a11y/no-noninteractive-element-interactions': 'off',
    },
  },

  // Unicorn plugin for additional best practices
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    plugins: {
      unicorn: unicornPlugin,
    },
    rules: {
      'unicorn/prevent-abbreviations': 'off',
      'unicorn/no-null': 'off',
      'unicorn/filename-case': [
        'error',
        {
          cases: {
            kebabCase: true,
            pascalCase: true,
            camelCase: true,
          },
        },
      ],
      'unicorn/no-nested-ternary': 'error',
      'unicorn/consistent-destructuring': 'error',
      'unicorn/prefer-at': 'off',
      'unicorn/prefer-code-point': 'off',
    },
  },

  // Code style and readability rules
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    rules: {
      'newline-before-return': 'error',
      'no-multiple-empty-lines': ['error', { max: 1, maxEOF: 1 }],
      'eol-last': ['error', 'never'],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'prefer-const': 'error',
      'no-var': 'error',
      'arrow-body-style': ['error', 'as-needed'],
      'object-shorthand': ['error', 'always'],
    },
  },

  // Playwright test files
  {
    files: ['**/*.test.{js,jsx,ts,tsx}', '**/__tests__/**/*.{js,jsx,ts,tsx}'],
    plugins: {
      playwright: playwrightPlugin,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  prettierConfig,
];

export default config;
