import { defineConfig, globalIgnores } from 'eslint/config';
import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';

export default defineConfig([
  globalIgnores(['node_modules/**', '.npm-cache/**', 'main.js', 'coverage/**', '.idea/**']),
  ...obsidianmd.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['**/*.mjs', 'vitest.config.ts'],
    languageOptions: { globals: globals.node },
    rules: { 'obsidianmd/no-nodejs-modules': 'off' },
  },
  {
    files: ['src/settings/settings-tab.ts'],
    // Retain Obsidian 1.8.7 support; declarative settings require Obsidian 1.13.
    rules: {
      'obsidianmd/settings-tab/prefer-setting-definitions': 'off',
      '@typescript-eslint/no-deprecated': 'off',
    },
  },
  {
    files: ['tests/**/*.ts'],
    // Obsidian UI/lifecycle policies target shipped plugin code, not test doubles or fixtures.
    rules: Object.fromEntries(Object.keys(obsidianmd.rules).map(name => [`obsidianmd/${name}`, 'off'])),
  },
]);
