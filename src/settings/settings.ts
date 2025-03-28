import { type App, moment, PluginSettingTab, sanitizeHTMLToDom, Setting } from 'obsidian'
import { loadConfigObject, type RenamiConfig } from 'renami'
import type RenamiPlugin from '../main'
import { capitalize, html, stripFileExtension } from '../utilities'

const placeholderConfig: Partial<RenamiConfig> = { options: {}, rules: [] }

export type RenamiPluginSettings = {
	autoRenameDebounceIntervalMs: number // Not exposed in settings
	autoRenameEnabled: boolean
	config: Partial<RenamiConfig>
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
		config: placeholderConfig,
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
		// Do any pre-commit settings validation here
		await this.plugin.settingsChangeCheck(this.initialSettings)
	}

	public render(): void {
		// Save scroll position, so the settings don't jump around on re-renders
		const scrollPosition = this.containerEl.scrollTop

		this.containerEl.empty()

		// Cancel any pending renames
		this.plugin.renameNoteFileNames.clear()

		// Fake input to catch the automatic first-input focus that was popping the search input.
		// Focus is still just a tab away.
		// const focusCatcher = this.containerEl.createEl('input', { type: 'text' })
		// focusCatcher.setAttribute('style', 'display: none;')

		// ----------------------------------------------------

		new Setting(this.containerEl)
			.setName('Renami config')
			.setDesc('Path to the Renami configuration file, relative to the vault root.')
			.setClass('renami-config')
			.addTextArea((text) => {
				text.setPlaceholder(JSON.stringify(placeholderConfig, undefined, 2))
				text.setValue(JSON.stringify(this.plugin.settings.config, undefined, 2))

				text.onChange((value) => {
					console.log('Renami config changed')
					try {
						// Attempt to parse JSON
						const parsedJson = JSON.parse(value.trim()) as Partial<RenamiConfig>

						// Validate the config
						const loadedConfig = loadConfigObject(parsedJson)
						if (loadedConfig === undefined) {
							throw new Error('Invalid config')
						}

						// Remove file extensions
						if (parsedJson.rules !== undefined && parsedJson.rules.length > 0) {
							console.log('----------------------------------')
							console.log(parsedJson.rules)
							parsedJson.rules = parsedJson.rules.map((rule) => {
								if (Array.isArray(rule.pattern)) {
									rule.pattern = rule.pattern.filter((pattern) => stripFileExtension(pattern))
								} else if (typeof rule.pattern === 'string') {
									rule.pattern = stripFileExtension(rule.pattern)
								}

								return rule
							})
						}

						// Don't use the merged config, just the user-provided config
						this.plugin.settings.config = parsedJson

						console.log(parsedJson)

						text.inputEl.removeClass('error')
					} catch (error) {
						console.log(error)
						text.inputEl.addClass('error')
					}

					// This.render()
				})

				text.inputEl.addEventListener('blur', async () => {
					text.inputEl.value = JSON.stringify(this.plugin.settings.config, undefined, 2)
					await this.plugin.saveSettings()
				})

				// This.render()
			})

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
			.setDesc(
				sanitizeHTMLToDom(
					html`Notes found: <em>${String(this.plugin.getWatchedFiles().length)}</em> Last renamed:
						<em>${capitalize(syncTime)}</em>`,
				),
			)
			.setClass('description-is-button-annotation')

		// TODO not yet implemented
		// new Setting(this.containerEl).setName('Automatic rename').addToggle((toggle) => {
		// 	toggle.setValue(this.plugin.settings.autoRenameEnabled)
		// 	toggle.onChange(async (value) => {
		// 		this.plugin.settings.autoRenameEnabled = value
		// 		await this.plugin.saveSettings()
		// 	})
		// })

		new Setting(this.containerEl).setName('Verbose notices').addToggle((toggle) => {
			toggle.setValue(this.plugin.settings.verboseNotices)
			toggle.onChange(async (value) => {
				this.plugin.settings.verboseNotices = value
				await this.plugin.saveSettings()
			})
		})

		// Restore scroll position
		this.containerEl.scrollTop = scrollPosition
	}
}
