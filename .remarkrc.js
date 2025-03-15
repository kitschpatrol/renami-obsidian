import { remarkConfig } from '@kitschpatrol/remark-config'

export default remarkConfig({
	rules: [
		['remarkValidateLinks', { repository: false }], // TODO remove once pushed
		['remark-lint-no-undefined-references', false],
		['remark-lint-maximum-heading-length', 80],
		['remark-lint-no-file-name-irregular-characters', false],
	],
})
