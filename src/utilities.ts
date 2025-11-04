import type { RenamiReport } from 'renami'
import { sanitizeHTMLToDom } from 'obsidian'
import plur from 'plur'
import type { RenamiFolder } from './settings/settings'

export function formatRenameReport(renameReport: RenamiReport, verbose: boolean): DocumentFragment {
	const files = renameReport.rules.flatMap(({ report }) => report.files)

	const statusReport = {
		conflict: 0,
		error: 0,
		renamed: 0,
		unchanged: 0,
	}

	for (const { status } of files) {
		if (status in statusReport) {
			// eslint-disable-next-line ts/no-unsafe-type-assertion
			statusReport[status as keyof typeof statusReport]++
		}
	}

	if (verbose) {
		// TODO something verbose
	}

	if (statusReport.unchanged === files.length) {
		return sanitizeHTMLToDom(
			html`<strong>Renami:</strong><br />All note names are already correct.<br />
				${statusReport.unchanged} / ${files.length} ${plur('note', files.length)} unchanged.`,
		)
	}

	if (statusReport.renamed > 0) {
		return sanitizeHTMLToDom(
			html`<strong>Renami:</strong><br />${statusReport.renamed} / ${files.length}
				${plur('note', files.length)} renamed.`,
		)
	}

	return sanitizeHTMLToDom(html`<strong>Renami:</strong><br />Failed, details TK.`)
}

export function objectsEqual<T extends Record<string, unknown> | undefined>(a: T, b: T): boolean {
	if (a === b) return true
	if (a === undefined || b === undefined) return false

	const aKeys = Object.keys(a)
	const bKeys = Object.keys(b)

	if (aKeys.length !== bKeys.length) return false

	for (const key of aKeys) {
		if (a[key] !== b[key]) return false
	}

	return true
}

/**
 * Checks if two arrays of RenamiFolder objects are identical in both
 * content and order (sequence equality).
 * @param a - The first array.
 * @param b - The second array.
 * @returns True if the arrays are identical sequences, false otherwise.
 */
export function renamiFoldersEqual(a: RenamiFolder[], b: RenamiFolder[]): boolean {
	if (a.length !== b.length) {
		return false
	}

	// Iterate and compare elements at each corresponding index.
	for (const [i, folderA] of a.entries()) {
		const folderB = b[i]

		// If properties don't match at any index, return false.
		if (folderA.folderPath !== folderB.folderPath || folderA.template !== folderB.template) {
			return false
		}
	}

	return true
}

export function capitalize(text: string): string {
	return text.charAt(0).toUpperCase() + text.slice(1)
}

/**
 * Elements with class will call a function when clicked
 */
export function sanitizeHtmlToDomWithFunction(
	html: string,
	targetClass: string,
	callback: () => void,
) {
	const fragment = sanitizeHTMLToDom(html)
	const functionElement = fragment.querySelector(`.${targetClass}`)
	functionElement?.addEventListener('click', callback)
	return fragment
}

/**
 * Mainly for nice formatting with prettier. But the line wrapping means we have to strip surplus whitespace.
 * @public
 */
export function html(strings: TemplateStringsArray, ...values: unknown[]): string {
	// eslint-disable-next-line unicorn/no-array-reduce
	const conjoined = strings.reduce(
		// eslint-disable-next-line ts/no-base-to-string
		(result, text, i) => `${result}${text}${String(values[i] ?? '')}`,
		'',
	)
	return conjoined.replaceAll(/\s+/g, ' ')
}

/**
 * Alternate HTML templating function.
 @todo test why this is breaking notice formatting
 @public
 */
export function htmlNew(strings: TemplateStringsArray, ...values: unknown[]): string {
	return trimLeadingIndentation(strings, ...values)
}

function trimLeadingIndentation(strings: TemplateStringsArray, ...values: unknown[]): string {
	const lines = strings
		// eslint-disable-next-line ts/no-base-to-string, unicorn/no-array-reduce
		.reduce((result, text, i) => `${result}${text}${String(values[i] ?? '')}`, '')
		.split(/\r?\n/)
		.filter((line) => line.trim() !== '')

	// Get leading white space of first line, and trim that much white space
	// from subsequent lines
	// eslint-disable-next-line regexp/no-unused-capturing-group
	const leadingSpace = /^(\s+)/.exec(lines[0])?.[0] ?? ''
	const leadingSpaceRegex = new RegExp(`^${leadingSpace}`)
	return lines.map((line) => line.replace(leadingSpaceRegex, '').trimEnd()).join('\n')
}
