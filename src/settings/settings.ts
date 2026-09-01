import type { RenamiConfig } from '@kitschpatrol/renami'
import type { App, SettingDefinitionItem, SettingDefinitionRender } from 'obsidian'
import { defaultOptions } from '@kitschpatrol/renami'
import { moment, PluginSettingTab, sanitizeHTMLToDom } from 'obsidian'
import type RenamiPlugin from '../main'
import { FolderSuggest } from '../extensions/folder-suggest'
import { capitalize, html, renamiFoldersEqual } from '../utilities'

export type RenamiFolder = {
	folderPath: string
	template: string
}

export type RenamiPluginSettings = {
	autoRenameDebounceIntervalMs: number
	autoRenameEnabled: boolean
	folders: RenamiFolder[] // List of folders to apply renaming rules to
	options: Required<NonNullable<RenamiConfig['options']>>
	stats: {
		auto: number
		duration: number
		errors: number
		latestRenameTime: number | undefined
		manual: number
	}
	verboseNotices: boolean
}

export const AUTO_RENAME_DEBOUNCE_MIN_MS = 100
export const AUTO_RENAME_DEBOUNCE_MAX_MS = 10_000

// TODO bind instead?
export function getRenamiPluginDefaultSettings(): RenamiPluginSettings {
	return {
		autoRenameDebounceIntervalMs: 1000,
		autoRenameEnabled: false,
		folders: [],
		options: defaultOptions,
		stats: {
			auto: 0,
			duration: 0,
			errors: 0,
			latestRenameTime: undefined,
			manual: 0,
		},
		verboseNotices: false,
	}
}

const optionsKeyPrefix = 'options.'

type RenamiSettingKey =
	| 'autoRenameDebounceIntervalMs'
	| 'autoRenameEnabled'
	| 'verboseNotices'
	| `options.${Extract<keyof RenamiPluginSettings['options'], string>}`

/**
 * An info-only row used in place of the pre-1.13 heading description pattern.
 * Uses a render callback because definitions with an empty name and no control,
 * render, or action are skipped entirely.
 */
function sectionDescription(descriptionHtml: string): SettingDefinitionRender {
	return {
		name: '',
		render(setting) {
			setting.setDesc(sanitizeHTMLToDom(descriptionHtml))
		},
		searchable: false,
	}
}

export class RenamiPluginSettingTab extends PluginSettingTab {
	private hasActiveSession = false
	private initialSettings: RenamiPluginSettings = getRenamiPluginDefaultSettings()
	override plugin: RenamiPlugin
	private refreshNotesFound: (() => void) | undefined

	constructor(app: App, plugin: RenamiPlugin) {
		super(app, plugin)
		this.plugin = plugin
	}

	/**
	 * Drops focus before a list mutation. Otherwise the re-render's focus
	 * restoration lands in a folder search input, which pops its suggestion
	 * popover.
	 */
	private blurActiveElement(): void {
		const active = this.containerEl.doc.activeElement

		if (active?.instanceOf(HTMLElement)) {
			active.blur()
		}
	}

	override getControlValue(key: string): unknown {
		if (key.startsWith(optionsKeyPrefix)) {
			const optionsRecord: Record<string, unknown> = this.plugin.settings.options
			return optionsRecord[key.slice(optionsKeyPrefix.length)]
		}

		return super.getControlValue(key)
	}

	override getSettingDefinitions(): Array<SettingDefinitionItem<RenamiSettingKey>> {
		// Cancel any pending renames
		this.plugin.renameNoteFileNames.clear()

		this.containerEl.addClass('renami-settings')

		// Capture a baseline at the start of each settings session so changes can
		// be detected when the tab is hidden
		if (!this.hasActiveSession) {
			this.hasActiveSession = true
			this.initialSettings = structuredClone(this.plugin.settings)
		}

		// Ensure there's always at least one folder row to fill in
		if (this.plugin.settings.folders.length === 0) {
			this.plugin.settings.folders.push({
				folderPath: '',
				template: '',
			})
		}

		const defaultSettings = getRenamiPluginDefaultSettings()

		return [
			{
				cls: 'renami-templates-intro',
				heading: 'Templates',
				items: [
					sectionDescription(
						html`Renami will rename notes in the listed folders according to the associated template
							strings. Renaming is always recursive, and templates at the bottom of the stack will
							take precedence over earlier ones matching the same files. See the
							<a href="https://github.com/kitschpatrol/renami-obsidian">Renami documentation</a> and
							the
							<a href="https://github.com/syntax-tree/unist-util-select/blob/main/readme.md#support"
								>selector documentation</a
							>
							for more information on template syntax.`,
					),
				],
				type: 'group',
			},
			{
				cls: 'renami-templates-list',
				items: this.plugin.settings.folders.map((folder) => ({
					name: '',
					render: (setting) => {
						setting.setNoInfo()
						setting.infoEl.remove()
						setting.setClass('renami-folder-setting')

						setting.addSearch((search) => {
							new FolderSuggest(search.inputEl, this.app)
							search
								.setPlaceholder('Select a folder')
								.setValue(folder.folderPath)
								.onChange((value) => {
									folder.folderPath = value
								})

							search.inputEl.addEventListener('blur', () => {
								void this.plugin.saveSettings().then(() => {
									this.refreshNotesFound?.()
								})
							})
						})

						setting.addText((text) => {
							text
								.setPlaceholder('Enter template string')
								.setValue(folder.template)
								.onChange((value) => {
									folder.template = value
								})

							text.inputEl.addEventListener('blur', () => {
								void this.plugin.saveSettings().then(() => {
									this.refreshNotesFound?.()
								})
							})
						})
					},
					searchable: false,
				})),
				onDelete: (index) => {
					// The last row's delete button is display-only
					if (this.plugin.settings.folders.length <= 1) {
						return
					}

					this.blurActiveElement()
					this.plugin.settings.folders.splice(index, 1)
					void this.plugin.saveSettings().then(() => {
						this.update()
					})
				},
				onReorder: (oldIndex, newIndex) => {
					const [movedFolder] = this.plugin.settings.folders.splice(oldIndex, 1)

					if (movedFolder !== undefined) {
						this.blurActiveElement()
						this.plugin.settings.folders.splice(newIndex, 0, movedFolder)
						void this.plugin.saveSettings().then(() => {
							this.update()
						})
					}
				},
				type: 'list',
			},
			{
				name: '',
				render: (setting) => {
					const update = () => {
						setting.setDesc(
							sanitizeHTMLToDom(
								html`Notes found: <em>${String(this.plugin.getWatchedFiles().length)}</em>`,
							),
						)
					}

					update()
					this.refreshNotesFound = update

					setting.setClass('description-is-button-annotation').addButton((button) => {
						button.setButtonText('Add folder').onClick(async () => {
							this.plugin.settings.folders.push({
								folderPath: '',
								template: '',
							})
							await this.plugin.saveSettings()
							this.update()
						})
					})

					return () => {
						this.refreshNotesFound = undefined
					}
				},
				searchable: false,
			},
			{
				heading: 'Transformation',
				items: [
					sectionDescription(
						html`Adjust casing, whitespace, and trimming of the generated filenames.
							<em>These options apply to all templates.</em>`,
					),
					{
						control: {
							key: 'options.caseType',
							/* eslint-disable perfectionist/sort-objects */
							options: {
								// TODO export these from library?
								preserve: 'Preserve',
								camel: 'camelCase',
								kebab: 'kebab-case',
								lowercase: 'lowercase',
								pascal: 'PascalCase',
								'screaming-kebab': 'SCREAMING-KEBAB',
								'screaming-snake': 'SCREAMING_SNAKE',
								sentence: 'Sentence case',
								slug: 'slug',
								snake: 'snake_case',
								title: 'Title Case',
								uppercase: 'UPPERCASE',
							},
							/* eslint-enable perfectionist/sort-objects */
							type: 'dropdown',
						},
						name: 'Case',
					},
					{
						control: {
							key: 'options.collapseDuplicateWhitespace',
							type: 'toggle',
						},
						name: 'Collapse whitespace',
					},
					// Everyone should trim...
					{
						control: {
							key: 'options.trim',
							type: 'toggle',
						},
						name: 'Trim',
					},
				],
				type: 'group',
			},
			{
				heading: 'Truncation',
				items: [
					sectionDescription(
						html`Control how long filenames are shortened when they exceed the maximum length.
							<em>These options apply to all templates.</em>`,
					),
					{
						control: {
							defaultValue: defaultSettings.options.maxLength,
							key: 'options.maxLength',
							min: 1,
							placeholder: String(defaultSettings.options.maxLength),
							step: 1,
							type: 'number',
							validate: (value) =>
								Number.isInteger(value) && value >= 1
									? undefined
									: 'Enter a whole number of 1 or greater.',
						},
						name: 'Maximum length',
					},
					{
						control: {
							key: 'options.truncationString',
							placeholder: defaultSettings.options.truncationString,
							type: 'text',
						},
						name: 'Elision text',
					},
					{
						control: {
							key: 'options.truncateOnWordBoundary',
							type: 'toggle',
						},
						name: 'Find word boundary',
					},
				],
				type: 'group',
			},
			{
				heading: 'Delimiters',
				items: [
					sectionDescription(
						html`Configure the characters used to join parts of the generated filename.
							<em>These options apply to all templates.</em>`,
					),
					{
						control: {
							key: 'options.delimiter',
							placeholder: defaultSettings.options.delimiter,
							type: 'text',
						},
						name: 'Delimiter text',
					},
					{
						control: {
							key: 'options.collapseSurplusDelimiters',
							type: 'toggle',
						},
						name: 'Collapse duplicates',
					},
				],
				type: 'group',
			},
			{
				heading: 'Advanced',
				items: [
					{
						control: {
							key: 'autoRenameEnabled',
							type: 'toggle',
						},
						desc: 'Automatically rename notes when watched files change.',
						name: 'Automatic rename',
					},
					// Doesn't update live because it's set when plugin is constructed...
					{
						control: {
							key: 'autoRenameDebounceIntervalMs',
							max: AUTO_RENAME_DEBOUNCE_MAX_MS,
							min: AUTO_RENAME_DEBOUNCE_MIN_MS,
							placeholder: String(defaultSettings.autoRenameDebounceIntervalMs),
							type: 'number',
							validate: (value) =>
								value >= AUTO_RENAME_DEBOUNCE_MIN_MS && value <= AUTO_RENAME_DEBOUNCE_MAX_MS
									? undefined
									: `Enter a value between ${AUTO_RENAME_DEBOUNCE_MIN_MS} and ${AUTO_RENAME_DEBOUNCE_MAX_MS} milliseconds.`,
						},
						desc: 'Minimum time between Renami invocations, in milliseconds. Restart Obsidian to apply changes.',
						name: 'Automatic rename delay',
					},
					{
						control: {
							key: 'options.ignoreFolderNotes',
							type: 'toggle',
						},
						desc: sanitizeHTMLToDom(
							html`Exclude notes with the same name as their parent folder from renaming. Useful in
								combination with the
								<a href="https://lostpaul.github.io/obsidian-folder-notes/">Folder notes</a>
								plugin.`,
						),
						name: 'Ignore folder notes',
					},
					{
						control: {
							key: 'verboseNotices',
							type: 'toggle',
						},
						desc: 'Show extra details during the renaming process, useful for debugging.',
						name: 'Verbose notices',
					},
					{
						control: {
							key: 'options.strict',
							type: 'toggle',
						},
						desc: 'Enforce strict idempotence. When enabled, files whose templates fail to produce a valid name will be renamed to the default file name. When disabled, the original name is preserved.',
						name: 'Strict',
					},
					{
						control: {
							key: 'options.defaultName',
							placeholder: defaultSettings.options.defaultName,
							type: 'text',
							validate: (value) =>
								value.trim().length > 0 ? undefined : 'Enter a non-empty file name.',
						},
						desc: 'Fallback name used when a template fails to produce a valid name and strict mode is enabled.',
						name: 'Default file name',
					},
					{
						desc: 'Copy the equivalent stand-alone Renami JSON configuration to the clipboard.',
						name: 'Configuration',
						render: (setting) => {
							setting.addButton((button) => {
								button
									.setTooltip('Copy configuration to clipboard')
									.setButtonText('Copy')
									.onClick(async () => {
										// eslint-disable-next-line node/no-unsupported-features/node-builtins
										await navigator.clipboard.writeText(
											JSON.stringify(
												this.plugin.getRenamiConfig(this.plugin.settings),
												undefined,
												2,
											),
										)
									})
							})
						},
					},
					{
						name: '',
						render: (setting) => {
							const { latestRenameTime } = this.plugin.settings.stats
							const syncTime =
								latestRenameTime === undefined ? 'Never' : moment.unix(latestRenameTime).fromNow()

							setting
								.setClass('description-is-button-annotation')
								.setDesc(sanitizeHTMLToDom(html`Last renamed: <em>${capitalize(syncTime)}</em>`))
								.addButton((button) => {
									button.setButtonText('Rename now')
									button.setCta()
									button.onClick(async () => {
										await this.plugin.renameNoteFileNames(true)
										this.plugin.renameNoteFileNames.flush()
									})
								})
						},
						searchable: false,
					},
				],
				type: 'group',
			},
		]
	}

	override hide(): void {
		// Normalize folders
		const sanitizedFolders = this.plugin.getSanitizedFolders()

		if (!renamiFoldersEqual(this.plugin.settings.folders, sanitizedFolders)) {
			this.plugin.settings.folders = sanitizedFolders
			void this.plugin.saveSettings()
		}

		// Do any pre-commit settings validation here
		void this.plugin.settingsChangeCheck(this.initialSettings)

		this.hasActiveSession = false
		super.hide()
	}

	override async setControlValue(key: string, value: unknown): Promise<void> {
		if (key.startsWith(optionsKeyPrefix)) {
			const optionsRecord: Record<string, unknown> = this.plugin.settings.options
			optionsRecord[key.slice(optionsKeyPrefix.length)] = value
			await this.plugin.saveSettings()
			return
		}

		await super.setControlValue(key, value)
	}
}
