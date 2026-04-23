/* eslint-env node */
module.exports = {
  root: true,
  env: { es2022: true, node: true, browser: true },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    project: ['./tsconfig.json', './backend/tsconfig.json', './frontend/tsconfig.json'],
  },
  plugins: ['@typescript-eslint', 'sonarjs'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/strict-type-checked',
    'plugin:sonarjs/recommended',
    'prettier',
  ],
  ignorePatterns: ['dist', 'build', 'node_modules', '.wrangler', 'coverage'],
  rules: {
    '@typescript-eslint/consistent-type-imports': 'error',
    'sonarjs/cognitive-complexity': ['error', 15],
    'sonarjs/no-duplicate-string': 'off',
  },
  overrides: [
    {
      files: ['frontend/src/components/**/*.tsx'],
      rules: {
        'no-restricted-syntax': [
          'error',
          {
            selector: "JSXText[value=/[A-Za-z]/]",
            message:
              'No hard-coded text in components — all copy must come from frontend/src/lib/copy.ts.',
          },
        ],
      },
    },
  ],
};
