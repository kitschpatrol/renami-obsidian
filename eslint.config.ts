import { eslintConfig } from '@kitschpatrol/eslint-config'

export default eslintConfig(
	{
		html: {
			overrides: {
				'html/no-inline-styles': 'off',
			},
		},
		ignores: ['examples/Renami Demo Vault/*'],
		ts: {
			overrides: {
				'jsdoc/require-jsdoc': 'off',
				'no-new': 'off',
				'perfectionist/sort-classes': 'off',
				// TODO move this to shared-config
				'ts/naming-convention': [
					'error',
					{
						format: ['UPPER_CASE'],
						modifiers: ['const', 'exported'],
						selector: 'variable',
						// Not objects...
						types: ['boolean', 'string', 'number', 'array'],
					},
				],
			},
		},
	},
	{
		files: ['README.md'],
		rules: {
			'unicorn/filename-case': 'off',
		},
	},
)
