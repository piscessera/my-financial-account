import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-config-prettier';

// No-network guard (AT-1.9, TC-0001 #26 "No outbound network calls", AC-10).
// This app is a local-only desktop app (CLAUDE.md §Project: "No Google API/OAuth
// integration — the app only reads/writes local files"). Importing/requiring Node's
// networking modules, or referencing the global `fetch`, anywhere in this codebase is
// forbidden by default.
//
// Allowlist mechanism: if a *future, documented* feature legitimately needs outbound
// network access, do not silently disable this rule. Instead add the specific module
// name to `allowedNetworkModules` below, with a comment citing the REQ/ANA/ADR that
// approved the exception, so the allowlist stays reviewable in diffs.
const allowedNetworkModules = [];

const networkModules = ['http', 'https', 'net', 'node:http', 'node:https', 'node:net'].filter(
  (m) => !allowedNetworkModules.includes(m),
);

export default tseslint.config(
  { ignores: ['**/dist/**', '**/dist-electron/**', '**/node_modules/**', '.claude/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: networkModules.map((name) => ({
            name,
            message:
              'No outbound network calls are allowed (TC-0001 #26 / AC-10). This is a local-only desktop app. See the allowlist mechanism documented in eslint.config.mjs if a future feature has an approved, documented need.',
          })),
        },
      ],
      'no-restricted-globals': [
        'error',
        {
          name: 'fetch',
          message:
            'No outbound network calls are allowed (TC-0001 #26 / AC-10). This is a local-only desktop app. See the allowlist mechanism documented in eslint.config.mjs if a future feature has an approved, documented need.',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: `CallExpression[callee.name='require'][arguments.0.value=/^(node:)?(${['http', 'https', 'net'].join('|')})$/]`,
          message:
            'No outbound network calls are allowed (TC-0001 #26 / AC-10). This is a local-only desktop app. See the allowlist mechanism documented in eslint.config.mjs if a future feature has an approved, documented need.',
        },
      ],
    },
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  prettier,
);
