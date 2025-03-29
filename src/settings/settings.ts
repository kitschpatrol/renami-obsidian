import type { App, ButtonComponent } from 'obsidian'
import type { RenamiConfig } from 'renami'
import { moment, PluginSettingTab, sanitizeHTMLToDom, Setting } from 'obsidian'
import { defaultOptions } from 'renami'
import Sortable from 'sortablejs'
import type RenamiPlugin from '../main'
import { FolderSuggest } from '../extensions/folder-suggest'
import { capitalize, html } from '../utilities'

export type RenamiFolder = {
	folderPath: string
	template: string
}

export type RenamiPluginSettings = {
	autoRenameDebounceIntervalMs: number // Not exposed in settings
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

// TODO bind instead?
export function getRenamiPluginDefaultSettings(): RenamiPluginSettings {
	return {
		autoRenameDebounceIntervalMs: 4000,
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

export class RenamiPluginSettingTab extends PluginSettingTab {
	private initialSettings: RenamiPluginSettings = getRenamiPluginDefaultSettings()
	plugin: RenamiPlugin

	constructor(app: App, plugin: RenamiPlugin) {
		super(app, plugin)
		this.plugin = plugin
	}

	display(): void {
		this.initialSettings = structuredClone(this.plugin.settings)
		this.containerEl.addClass('renami-settings')
		this.containerEl.setAttr('id', 'renami-settings')
		this.render()
	}

	async hide(): Promise<void> {
		// Normalize folders
		this.plugin.settings.folders = this.plugin.getSanitizedFolders()

		// Do any pre-commit settings validation here
		await this.plugin.settingsChangeCheck(this.initialSettings)
	}

	public render(): void {
		// Save scroll position, so the settings don't jump around on re-renders
		const scrollPosition = this.containerEl.scrollTop

		this.containerEl.empty()

		// Cancel any pending renames
		this.plugin.renameNoteFileNames.clear()

		// Ensure we have at least one folder
		if (this.plugin.settings.folders.length === 0) {
			this.plugin.settings.folders.push({
				folderPath: '',
				template: '',
			})
		}

		// Fake input to catch the automatic first-input focus that was popping the search input.
		// Focus is still just a tab away.
		const focusCatcher = this.containerEl.createEl('input', { type: 'text' })
		focusCatcher.setAttribute('style', 'display: none;')

		// ----------------------------------------------------

		new Setting(this.containerEl)
			.setName('Templates')
			.setHeading()
			.setDesc(
				sanitizeHTMLToDom(
					html`Renami will rename notes in the listed folders according to the associated template
						strings. Renaming is always recursive, and templates at the bottom of the stack will
						take precedence over earlier ones matching the same files. See the
						<a href="https://github.com/kitschpatrol/renami-obsidian">Renami documentation</a>
						for details on how to format the templates.`,
				),
			)

		const folderListElement = this.containerEl.createEl('div', { cls: 'sortable-container' })

		if (this.plugin.settings.folders.length > 1) {
			Sortable.create(folderListElement, {
				animation: 100,
				direction: 'vertical',
				draggable: '.setting-item',
				forceFallback: true, // Force old-school implementation to fix spill animation
				handle: '.drag-handle',
				onEnd: async (event) => {
					console.log('end ----------------------------------')
					console.log(event.oldIndex, event.newIndex)

					const { newIndex, oldIndex } = event

					if (oldIndex !== undefined && newIndex !== undefined && oldIndex !== newIndex) {
						this.plugin.settings.folders.splice(
							newIndex,
							0,
							this.plugin.settings.folders.splice(oldIndex, 1)[0],
						)
						await this.plugin.saveSettings()
					}
				},
			})
		}

		for (const [index, folder] of this.plugin.settings.folders.entries()) {
			const searchSetting = new Setting(folderListElement)

			searchSetting.setNoInfo()

			searchSetting.addExtraButton((callback) => {
				callback
					.setIcon('grip-horizontal')
					.setTooltip('Drag to reorder')
					.setDisabled(this.plugin.settings.folders.length <= 1)
					.extraSettingsEl.addClass('drag-handle')
			})

			searchSetting.infoEl.remove()

			searchSetting
				.addSearch((callback) => {
					new FolderSuggest(callback.inputEl, this.app)
					callback
						.setPlaceholder('Select a folder')
						.setValue(folder.folderPath)
						.onChange((value) => {
							this.plugin.settings.folders[index].folderPath = value
						})

					callback.inputEl.addEventListener('blur', async () => {
						await this.plugin.saveSettings()
						// Kludge for label re-rendering without focus-stealing
						// full-rerender
						updateAddFolderButton()
					})
				})
				.setClass('folder-setting')

			searchSetting.addText((callback) => {
				// Text area for template
				callback
					.setPlaceholder('Enter template string')
					.setValue(folder.template)
					.onChange((value) => {
						this.plugin.settings.folders[index].template = value
					})

				callback.inputEl.addEventListener('blur', async () => {
					await this.plugin.saveSettings()
					// Kludge for label re-rendering without focus-stealing
					// full-rerender
					updateAddFolderButton()
				})
			})

			searchSetting.addExtraButton((callback) => {
				callback
					.setIcon('cross')
					.setDisabled(this.plugin.settings.folders.length <= 1)
					.setTooltip('Delete row')
					.onClick(async () => {
						this.plugin.settings.folders.splice(index, 1)
						await this.plugin.saveSettings()
						this.render()
					})
					.extraSettingsEl.addClass('delete-button')
			})
		}

		const addFolderButton = new Setting(this.containerEl)
			.addButton((button: ButtonComponent) => {
				button
					.setTooltip('Add folder')
					.setButtonText('Add folder')
					// .setIcon('plus')
					.onClick(async () => {
						this.plugin.settings.folders.push({
							folderPath: '',
							template: '',
						})
						await this.plugin.saveSettings()
						this.render()
					})
			})
			.setClass('description-is-button-annotation')

		const updateAddFolderButton = () => {
			addFolderButton.setDesc(
				sanitizeHTMLToDom(
					html`Notes found: <em>${String(this.plugin.getWatchedFiles().length)}</em>`,
				),
			)
		}

		updateAddFolderButton()

		// Global options ---------------------------------

		new Setting(this.containerEl)
			.setName('Global options')
			.setHeading()
			.setDesc(sanitizeHTMLToDom(html`These options apply to all templates.`))

		// TODO export this from library
		new Setting(this.containerEl).setName('Case').addDropdown((dropdown) => {
			/* eslint-disable perfectionist/sort-objects */
			dropdown
				.addOptions({
					preserve: 'Preserve',
					camel: 'camelCase',
					kebab: 'kebab-case',
					lowercase: 'lowercase',
					pascal: 'PascalCase',
					'screaming-kebab': 'SCREAMING-KEBAB',
					'screaming-snake': 'SCREAMING_SNAKE',
					sentence: 'Sentence case',
					slug: 'slug-case',
					snake: 'snake_case',
					title: 'Title Case',
					uppercase: 'UPPERCASE',
				})
				.onChange(async (value) => {
					this.plugin.settings.options.caseType =
						value as typeof this.plugin.settings.options.caseType
					await this.plugin.saveSettings()
				})
			/* eslint-enable perfectionist/sort-objects */
		})

		new Setting(this.containerEl).setName('Collapse whitespace').addToggle((toggle) => {
			toggle.setValue(this.plugin.settings.verboseNotices)
			toggle.onChange(async (value) => {
				this.plugin.settings.verboseNotices = value
				await this.plugin.saveSettings()
			})
		})

		// Everyone should trim...
		// new Setting(this.containerEl).setName('Trim').addToggle((toggle) => {
		// 	toggle.setValue(this.plugin.settings.options.trim)
		// 	toggle.onChange(async (value) => {
		// 		this.plugin.settings.options.trim = value
		// 		await this.plugin.saveSettings()
		// 	})
		// })

		new Setting(this.containerEl).setName('Collapse delimiters').addToggle((toggle) => {
			toggle.setValue(this.plugin.settings.options.collapseSurplusDelimiters)
			toggle.onChange(async (value) => {
				this.plugin.settings.options.collapseSurplusDelimiters = value
				await this.plugin.saveSettings()
			})
		})

		new Setting(this.containerEl).setName('Delimiter').addText((text) => {
			text.setPlaceholder(String(getRenamiPluginDefaultSettings().options.delimiter))
			text.setValue(String(this.plugin.settings.options.delimiter))
			text.onChange((value) => {
				this.plugin.settings.options.delimiter = value
			})

			text.inputEl.addEventListener('blur', async () => {
				await this.plugin.saveSettings()
			})
		})

		new Setting(this.containerEl).setName('Ignore folder notes').addToggle((toggle) => {
			toggle.setValue(this.plugin.settings.options.ignoreFolderNotes)
			toggle.onChange(async (value) => {
				this.plugin.settings.options.ignoreFolderNotes = value
				await this.plugin.saveSettings()
			})
		})

		new Setting(this.containerEl).setName('Maximum length').addText((text) => {
			text.setPlaceholder(String(getRenamiPluginDefaultSettings().options.maxLength))
			text.setValue(String(this.plugin.settings.options.maxLength))
			text.onChange((value) => {
				this.plugin.settings.options.maxLength = Number(value)
			})

			text.inputEl.addEventListener('blur', async () => {
				await this.plugin.saveSettings()
			})
		})

		new Setting(this.containerEl).setName('Truncation text').addText((text) => {
			text.setPlaceholder(String(getRenamiPluginDefaultSettings().options.truncationString))
			text.setValue(String(this.plugin.settings.options.truncationString))
			text.onChange((value) => {
				this.plugin.settings.options.truncationString = value
			})

			text.inputEl.addEventListener('blur', async () => {
				await this.plugin.saveSettings()
			})
		})

		new Setting(this.containerEl).setName('Truncate on word boundary').addToggle((toggle) => {
			toggle.setValue(this.plugin.settings.options.truncateOnWordBoundary)
			toggle.onChange(async (value) => {
				this.plugin.settings.options.truncateOnWordBoundary = value
				await this.plugin.saveSettings()
			})
		})

		new Setting(this.containerEl).setName('Verbose notices').addToggle((toggle) => {
			toggle.setValue(this.plugin.settings.verboseNotices)
			toggle.onChange(async (value) => {
				this.plugin.settings.verboseNotices = value
				await this.plugin.saveSettings()
			})
		})

		// Action button ---------------------------------

		const { latestRenameTime } = this.plugin.settings.stats
		const syncTime =
			latestRenameTime === undefined ? 'Never' : moment.unix(latestRenameTime).fromNow()

		new Setting(this.containerEl)
			.addButton((button) => {
				button.setButtonText('Rename now')
				button.setCta()
				button.onClick(async () => {
					await this.plugin.renameNoteFileNames(true)
					this.plugin.renameNoteFileNames.flush()
				})
			})
			.setDesc(sanitizeHTMLToDom(html`Last renamed: <em>${capitalize(syncTime)}</em>`))
			.setClass('description-is-button-annotation')
			.setDesc(sanitizeHTMLToDom(html`Last renamed: <em>${capitalize(syncTime)}</em>`))

		// TODO not yet implemented
		// new Setting(this.containerEl).setName('Automatic rename').addToggle((toggle) => {
		// 	toggle.setValue(this.plugin.settings.autoRenameEnabled)
		// 	toggle.onChange(async (value) => {
		// 		this.plugin.settings.autoRenameEnabled = value
		// 		await this.plugin.saveSettings()
		// 	})
		// })

		// Restore scroll position
		this.containerEl.scrollTop = scrollPosition
	}
}
