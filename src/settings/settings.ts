import { type App, moment, PluginSettingTab, sanitizeHTMLToDom, Setting } from 'obsidian'
import type RenamiPlugin from '../main'
import { capitalize, html } from '../utilities'

export type RenamiPluginSettings = {
	autoRenameDebounceIntervalMs: number // Not exposed in settings
	autoRenameEnabled: boolean
	configPath: string
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
		configPath: '/renami.config.ts',
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
			.addText((text) => {
				text.setPlaceholder('Config path')

				text.setValue(this.plugin.settings.configPath)
				text.onChange((value) => {
					this.plugin.settings.configPath = value.trim().length > 0 ? value.trim() : ''
				})

				text.inputEl.addEventListener('blur', async () => {
					await this.plugin.saveSettings()
				})

				this.render()
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

		new Setting(this.containerEl).setName('Automatic rename').addToggle((toggle) => {
			toggle.setValue(this.plugin.settings.autoRenameEnabled)
			toggle.onChange(async (value) => {
				this.plugin.settings.autoRenameEnabled = value
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

		// Restore scroll position
		this.containerEl.scrollTop = scrollPosition
	}
}
