import { defineConfig, globalIgnores } from 'eslint/config';
import obsidianmd from 'eslint-plugin-obsidianmd';
import stylistic from '@stylistic/eslint-plugin';
import globals from 'globals';

export default defineConfig([
	...obsidianmd.configs.recommended,

	globalIgnores([
		'node_modules/**',
		'.npm-cache/**',
		'main.js',
		'coverage/**',
		'.idea/**',
	]),

	{
		files: ['**/*.ts', '**/*.tsx'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},

	{
		files: ['src/**/*.ts', 'tests/**/*.ts'],
		plugins: {
			'@stylistic': stylistic,
		},
		languageOptions: {
			globals: globals.browser,
		},
		rules: {
			curly: ['error', 'all'],
			'@stylistic/brace-style': ['error', '1tbs', {
				allowSingleLine: false,
			}],
		},
	},

	// Інші твої блоки конфігурації залишаються без змін.
]);
