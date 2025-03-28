/* eslint-disable unicorn/consistent-function-scoping */
/* eslint-disable ts/unbound-method */

import escapeStringRegexp from 'escape-string-regexp'
import {
	getRenamiPluginDefaultSettings,
	type RenamiPluginSettings,
	RenamiPluginSettingTab,
} from './settings/settings'
import { formatRenameReport, html, sanitizeHtmlToDomWithFunction } from './utilities'

// An alternate debounce library with a `trigger` method is used instead of the
// Obsidian API's built-in implementation. The `trigger` method allows
// user-initiated actions to be executed immediately, and also clears any
// scheduled future invocations. This prevents multiple invocations if one is
// already scheduled at the time of the user-initiated invocation. The import is
// named with a prefix so there's no ambiguity vs the built-in Obsidian
// implementation.
import sindreDebounce from 'debounce'
import path from 'node:path' // Assuming polyfilled
import {
	FileSystemAdapter,
	moment,
	normalizePath,
	Notice,
	Plugin,
	sanitizeHTMLToDom,
	type TAbstractFile,
	TFile,
	TFolder,
	Vault,
} from 'obsidian'
import { rename } from 'renami'

export default class RenamiPlugin extends Plugin {
	public settings: RenamiPluginSettings = getRenamiPluginDefaultSettings()
	private readonly settingsTab: RenamiPluginSettingTab = new RenamiPluginSettingTab(this.app, this)

	// ----------------------------------------------------

	// Initialization

	async onload() {
		console.log('----------------------------------')

		console.log('Renami plugin loaded!!')

		// Bindings
		this.fileAdapterWrite = this.fileAdapterWrite.bind(this)
		this.fileAdapterRead = this.fileAdapterRead.bind(this)
		this.fileAdapterReadBuffer = this.fileAdapterReadBuffer.bind(this)
		this.fileAdapterStat = this.fileAdapterStat.bind(this)
		this.fileAdapterRename = this.fileAdapterRename.bind(this)

		this.openSettingsTab = this.openSettingsTab.bind(this)

		this.getWatchedFiles = this.getWatchedFiles.bind(this)
		this.getSanitizedFolders = this.getSanitizedFolders.bind(this)

		this.getVaultBasePath = this.getVaultBasePath.bind(this)
		this.getAllFilePaths = this.getAllFilePaths.bind(this)
		this.vaultPathToAbsolutePath = this.vaultPathToAbsolutePath.bind(this)
		this.absolutePathToVaultPath = this.absolutePathToVaultPath.bind(this)

		// The debounce library we're using handles binding internally
		// this.renameNoteFileNames = this.renameNoteFileNames.bind(this)

		await this.loadSettings()

		// Writes any new defaults, useful for migrations
		// TODO check if this is necessary first
		await this.saveSettings()
		this.addSettingTab(this.settingsTab)

		this.addCommand({
			callback: () => {
				// Trigger is not receiving a default `userInitiated` value on the
				// first invocation for some reason... so we specify it manually
				// and then flush to invoke without delay.
				// this.plugin.renameNoteFileNames.trigger()
				void this.renameNoteFileNames(true)
				this.renameNoteFileNames.flush()
			},
			id: 'update-renami-obsidian',
			name: 'Update note file names',
		})

		// Spot any changes since last session
		// Where is "unregisterEvent"?
		this.app.workspace.onLayoutReady(async () => {
			// Sync at startup if auto-sync is enabled...
			await this.renameNoteFileNames(false)
			this.registerEvent(this.app.vault.on('create', this.handleCreate.bind(this)))
		})

		// Create is also called when the vault is first loaded for each existing file
		this.registerEvent(this.app.vault.on('delete', this.handleDelete.bind(this)))

		// Still necessary in case notes are dragged in
		this.registerEvent(this.app.vault.on('modify', this.handleModify.bind(this)))

		// Only look at folders, which can affect deck names
		this.registerEvent(this.app.vault.on('rename', this.handleRename.bind(this)))
	}

	// Typed override

	// eslint-disable-next-line ts/no-restricted-types
	async loadData(): Promise<null | RenamiPluginSettings> {
		// eslint-disable-next-line ts/no-restricted-types
		const settings = (await super.loadData()) as null | RenamiPluginSettings
		return settings
	}

	// Nothing to do on unload
	// onunload() {
	// }

	// ----------------------------------------------------

	// Settings

	async loadSettings() {
		// Merge any saved settings into defaults
		// TODO detect change and return boolean to skip subsequent writes?
		this.settings = { ...this.settings, ...(await this.loadData()) }
	}

	openSettingsTab() {
		// https://forum.obsidian.md/t/open-settings-for-my-plugin-community-plugin-settings-deeplink/61563/4
		this.app.setting.open()
		this.app.setting.openTabById(this.manifest.id)
	}

	/**
	 * Certain settings changes should trigger a name update from Renami, (but only fires if auto sync is enabled).
	 */
	public async settingsChangeCheck(previousSettings: RenamiPluginSettings) {
		if (previousSettings.config !== this.settings.config) {
			await this.renameNoteFileNames(false)
		}
	}

	// This never seems to fire, even after manually editing the settings file?
	async onExternalSettingsChange() {
		if (this.settings.verboseNotices) {
			// TODO when is this actually called?
			new Notice('External settings changed')
		}

		const originalSettings = structuredClone(this.settings)
		await this.loadSettings()
		await this.settingsChangeCheck(originalSettings)
	}

	async saveSettings() {
		await this.saveData(this.settings)
	}

	// ----------------------------------------------------

	// Primary commands

	// public async renameNoteFileNamesInternal(userInitiated: boolean): Promise<void> {
	// 	if (!this.settings.autoRenameEnabled && !userInitiated) {
	// 		return
	// 	}

	// 	const files: TFile[] = this.getWatchedFiles()

	// 	if (files.length === 0) {
	// 		if (userInitiated || this.settings.verboseNotices) {
	// 			new Notice(
	// 				sanitizeHtmlToDomWithFunction(
	// 					html`<strong>Anki note file rename:</strong><br />No flashcard notes found to rename.
	// 						Check your flashcard folders in Yanki's <a class="settings">settings tab</a>.`,
	// 					'settings',
	// 					this.openSettingsTab,
	// 				),
	// 			)
	// 		}

	// 		return
	// 	}

	// 	// All watched files as absolute paths
	// 	// const filePaths = files.map((file) => this.vaultPathToAbsolutePath(file.path))
	// 	// const report = await renameFiles(filePaths, this.getRenameFilesOptions(this.settings))

	// 	// TODO call renameNoteFileNames

	// 	if (userInitiated || this.settings.verboseNotices) {
	// 		new Notice(formatRenameReport(report), 5000)
	// 	}
	// }

	renameNoteFileNames = sindreDebounce(async (userInitiated: boolean): Promise<void> => {
		if (!userInitiated && !this.settings.autoRenameEnabled) {
			return
		}

		if (userInitiated || this.settings.verboseNotices) {
			new Notice(
				sanitizeHTMLToDom(
					html`<strong>${userInitiated ? '' : 'Automatic '}Renami rename starting...</strong>`,
				),
			)
		}

		// TODO hmm,
		// All watched files as absolute paths.
		// Additionally, getSyncFilesOptions pulls paths to ALL assets in the vault
		// to support resolving wiki links.
		// const filePaths = files.map((file) => this.vaultPathToAbsolutePath(file.path))

		const workingConfig = structuredClone(this.settings.config)

		if (workingConfig.rules === undefined) {
			if (userInitiated || this.settings.verboseNotices) {
				new Notice(
					sanitizeHTMLToDom(
						html`<strong
							>${userInitiated ? '' : 'Automatic '}Renami rename failed because no rules are
							specified...</strong
						>`,
					),
				)
			}
			return
		}

		for (const rule of workingConfig.rules) {
			const patternArray = Array.isArray(rule.pattern) ? rule.pattern : [rule.pattern]
			rule.pattern = patternArray.map((pattern) => this.vaultPathToAbsolutePath(pattern))
		}

		console.log(workingConfig)

		try {
			// const absolutePattern = this.vaultPathToAbsolutePath('**/*.md')

			const report = await rename({
				config: workingConfig,
				// TODO get this from somewhere else?
				fileAdapter: {
					readFile: this.fileAdapterRead,
					readFileBuffer: this.fileAdapterReadBuffer,
					rename: this.fileAdapterRename,
					stat: this.fileAdapterStat,
					writeFile: this.fileAdapterWrite,
				},
			})

			if (userInitiated || this.settings.verboseNotices) {
				new Notice(formatRenameReport(report), 15_000)
			}

			// Dev stats
			this.settings.stats.latestRenameTime = moment().unix()
			this.settings.stats.duration =
				this.settings.stats.duration === 0
					? report.duration
					: (this.settings.stats.duration + report.duration) / 2

			if (userInitiated) {
				this.settings.stats.manual++
			} else {
				this.settings.stats.auto++
			}
		} catch (error) {
			this.settings.stats.errors++

			// Always notice on weird errors
			const fragment = sanitizeHtmlToDomWithFunction(
				html`<strong>Renami rename failed:</strong>
					<pre style="white-space: pre-wrap;">${String(error)}</pre>
					Please check <a class="settings">the plugin settings</a>, review the
					<a href="https://github.com/kitschpatrol/renami-obsidian">documentation</a>, and try
					again. If trouble persists, please
					<a href="https://github.com/kitschpatrol/renami-obsidian/issues">open an issue</a>.`,
				'settings',
				this.openSettingsTab,
			)
			new Notice(fragment, 15_000)
		}

		// Save stats and update the settings tab
		await this.saveSettings()
		this.settingsTab.render()
	}, this.settings.autoRenameDebounceIntervalMs)

	// ----------------------------------------------------

	// Renami FileAdapter implementations

	async fileAdapterRead(filePath: string): Promise<string> {
		filePath = this.absolutePathToVaultPath(filePath)
		const file = this.app.vault.getFileByPath(filePath)

		if (file === null) {
			throw new Error(`Read failed. File not found: ${filePath}`)
		}

		return this.app.vault.read(file)
	}

	async fileAdapterReadBuffer(filePath: string): Promise<Uint8Array> {
		filePath = this.absolutePathToVaultPath(filePath)
		const file = this.app.vault.getFileByPath(filePath)
		if (file === null) {
			throw new Error(`Read buffer failed. File not found: ${filePath}`)
		}

		const content = await this.app.vault.readBinary(file)
		return new Uint8Array(content)
	}

	async fileAdapterStat(
		filePath: string,
	): Promise<{ ctimeMs: number; mtimeMs: number; size: number }> {
		filePath = this.absolutePathToVaultPath(filePath)
		const file = this.app.vault.getFileByPath(filePath)
		if (file === null) {
			throw new Error(`Stat failed. File not found: ${filePath}`)
		}

		return new Promise((resolve) => {
			resolve({
				ctimeMs: file.stat.ctime,
				mtimeMs: file.stat.mtime,
				size: file.stat.size,
			})
		})
	}

	async fileAdapterWrite(filePath: string, data: string): Promise<void> {
		const file = this.app.vault.getFileByPath(this.absolutePathToVaultPath(filePath))
		if (file === null) {
			throw new Error(`Write failed. File not found: ${filePath}`)
		}

		return this.app.vault.modify(file, data)
	}

	async fileAdapterRename(oldPath: string, newPath: string): Promise<void> {
		const vaultFileOldPath = this.absolutePathToVaultPath(oldPath)
		const file = this.app.vault.getFileByPath(vaultFileOldPath)
		if (file === null) {
			throw new Error(`Rename failed. File not found: ${vaultFileOldPath}`)
		}

		const vaultFileNewPath = this.absolutePathToVaultPath(newPath)
		return this.app.vault.rename(file, vaultFileNewPath)
	}

	// ----------------------------------------------------

	// Vault observation

	// Watch for changes, but only folders!
	private async handleRename(fileOrFolder: TAbstractFile, oldPath: string) {
		if (fileOrFolder instanceof TFile) {
			return
		}

		const watchedFolders = this.getSanitizedFolders()
		if (watchedFolders.includes(oldPath)) {
			// TODO would make sense if folder list was maintained in Obsidian instead of renami.config.ts
			// const updatedFolders = watchedFolders.map((folder) => {
			// 	if (folder.startsWith(oldPath)) {
			// 		return fileOrFolder.path + folder.slice(oldPath.length)
			// 	}
			// 	return folder
			// })
			// this.settings.folders = updatedFolders
			// await this.saveSettings()
			// await this.renameNoteFileNames(false)
		} else if (this.isInsideWatchedFolders(fileOrFolder)) {
			//
			await this.renameNoteFileNames(false)
		}
	}

	private async handleCreate(fileOrFolder: TAbstractFile) {
		// Don't care about folders
		if (fileOrFolder instanceof TFile && this.isInsideWatchedFolders(fileOrFolder)) {
			await this.renameNoteFileNames(false)
		}
	}

	private async handleDelete(fileOrFolder: TAbstractFile) {
		if (this.isInsideWatchedFolders(fileOrFolder)) {
			// TODO would make sense if folder list was maintained in Obsidian instead of renami.config.ts
			// Remove from settings if it was a watched folder
			// if (fileOrFolder instanceof TFolder) {
			// 	const watchedFolders = this.getSanitizedFolders()
			// 	const initialLength = watchedFolders.length
			// 	this.settings.folders = watchedFolders.filter((folder) => folder !== fileOrFolder.path)
			// 	if (this.settings.folders.length !== initialLength) {
			// 		await this.saveSettings()
			// 	}
			// }

			await this.renameNoteFileNames(false)
		}
	}

	private async handleModify(fileOrFolder: TAbstractFile) {
		if (this.isInsideWatchedFolders(fileOrFolder)) {
			// Rename right away
			await this.renameNoteFileNames(false)
		}
	}

	private isInsideWatchedFolders(fileOrFolder: TAbstractFile): boolean {
		// Use dirname to find parent folder even if file has been deleted
		const folderPath = `${fileOrFolder instanceof TFolder ? fileOrFolder.path : (fileOrFolder.parent?.path ?? path.dirname(fileOrFolder.path))}/`
		return this.getSanitizedFolders().some((watchedFolder) => folderPath.startsWith(watchedFolder))
	}

	public getWatchedFiles(): TFile[] {
		// TODO get this from Renami settings...
		const ignoreFolderNotes = false

		const files: TFile[] = []
		for (const folderPath of this.getSanitizedFolders()) {
			const folder = this.app.vault.getAbstractFileByPath(folderPath)

			if (folder instanceof TFolder) {
				Vault.recurseChildren(folder, (file) => {
					// Only allow at Markdown
					// Optionally ignore folder notes
					if (
						file instanceof TFile &&
						file.extension === 'md' &&
						// eslint-disable-next-line ts/no-unnecessary-condition
						(!ignoreFolderNotes || file.parent?.name !== file.basename)
					) {
						files.push(file)
					}
				})
			}
		}

		return files
	}

	public getSanitizedFolders(): string[] {
		// TODO get this from renami config
		return []
		//
		// return [
		// 	...new Set(
		// 		this.settings.folders
		// 			.filter((folder) => folder.trim().length > 0)
		// 			.map((folderPath) => normalizePath(folderPath)),
		// 	),
		// ]
	}

	// ----------------------------------------------------

	// Paths

	private getAllFilePaths(): string[] {
		const vaultBasePath = this.getVaultBasePath() ?? ''
		return this.app.vault.getFiles().map((file) => path.join(vaultBasePath, file.path))
	}

	// Does not have a trailing slash
	private getVaultBasePath(): string | undefined {
		const { adapter } = this.app.vault
		if (adapter instanceof FileSystemAdapter) {
			// We want the Windows slash-reversing effects of normalize, but not the
			// removal of the leading / from the path on POSIX systems. Split the
			// difference, detect drive letters and append if missing. Forsake Windows
			// extended paths for now.
			// https://forum.obsidian.md/t/how-to-get-vault-absolute-path/22965/3
			// https://forum.obsidian.md/t/normalizepath-removes-a-leading/24713
			// https://github.com/Taitava/obsidian-shellcommands/issues/44
			//
			// Desired form is:
			// - Windows: "C:/path/to/vault"
			// - POSIX: "/path/to/vault"
			const possiblyBarePath = normalizePath(adapter.getBasePath())

			return /^[A-Z]:/i.test(possiblyBarePath)
				? possiblyBarePath
				: path.join(path.sep, possiblyBarePath)
		}
	}

	private vaultPathToAbsolutePath(vaultPath: string): string {
		const vaultBasePath = this.getVaultBasePath() ?? ''
		return path.join(vaultBasePath, vaultPath)
	}

	private absolutePathToVaultPath(absolutePath: string): string {
		// Strip any leading vault path
		const vaultPath = this.getVaultBasePath()

		if (vaultPath === undefined) {
			console.warn('Vault path not found')
			return absolutePath
		}

		// Regex escape here addresses
		// https://github.com/kitschpatrol/yanki-obsidian/issues/28
		const basePathRegex = new RegExp(`^${escapeStringRegexp(vaultPath)}/?`)
		return absolutePath.replace(basePathRegex, '')
	}
}
