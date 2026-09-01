import type { Plugin } from 'esbuild'
import chokidar from 'chokidar'
import esbuild from 'esbuild'
import { copy } from 'esbuild-plugin-copy'
import fs from 'node:fs/promises'
import process from 'node:process'

// The plugin requires Obsidian 1.13.4+ (see manifest `minAppVersion`), but
// that gates the app version, not the installer: older installers with older
// Electron / Chromium runtimes can still run newer app versions. The newest
// syntax we emit is the ES2024 `v` regex flag, supported since Chromium 112
// (2023-era installers). For reference, the Obsidian 1.13.4 installer ships
// Electron 43.1.1 with Chromium 150 and Node 24.18:
//   - https://releases.electronjs.org/release/v43.1.1

const banner = `/*
This is a generated source file!
If you want to view the original source code, please visit:
https://github.com/kitschpatrol/renami-obsidian
*/
`

// The onResolve filter is translated by esbuild into a Go regular expression,
// which rejects JavaScript's unicode flags
// eslint-disable-next-line require-unicode-regexp
const NODE_MODULE_PREFIX_REGEX = /^node:.+$/

const ignoreNodeModulesPlugin: Plugin = {
	name: 'ignore-node-modules',
	setup(build) {
		build.onResolve({ filter: NODE_MODULE_PREFIX_REGEX }, (args) => ({
			external: true,
			path: args.path,
		}))
	},
}

const production = process.argv.includes('production')

const context = await esbuild.context({
	banner: {
		js: banner,
	},
	bundle: true,
	entryPoints: ['./src/main.ts'],
	external: [
		'obsidian',
		'electron',
		'@codemirror/autocomplete',
		'@codemirror/collab',
		'@codemirror/commands',
		'@codemirror/language',
		'@codemirror/lint',
		'@codemirror/search',
		'@codemirror/state',
		'@codemirror/view',
		'@lezer/common',
		'@lezer/highlight',
		'@lezer/lr',
		// Node 20 builtins
		'assert',
		'assert/strict',
		'async_hooks',
		'buffer',
		'child_process',
		'cluster',
		'console',
		'constants',
		'crypto',
		'dgram',
		'diagnostics_channel',
		'dns',
		'dns/promises',
		'domain',
		'events',
		'fs',
		'fs/promises',
		'http',
		'http2',
		'https',
		'inspector',
		'inspector/promises',
		'module',
		'net',
		'os',
		'path',
		'path/posix',
		'path/win32',
		'perf_hooks',
		'process',
		'punycode',
		'querystring',
		'readline',
		'readline/promises',
		'repl',
		'stream',
		'stream/consumers',
		'stream/promises',
		'stream/web',
		'string_decoder',
		'timers',
		'timers/promises',
		'tls',
		'trace_events',
		'tty',
		'url',
		'util',
		'util/types',
		'v8',
		'vm',
		'wasi',
		'worker_threads',
		'zlib',
	],
	format: 'cjs',
	logLevel: 'error',
	minify: production,
	outbase: 'dist',
	outfile: 'dist/main.js',
	platform: 'browser',
	plugins: [
		ignoreNodeModulesPlugin,
		copy({
			assets: { from: ['./src/**/*.css'], to: ['./'] },
		}),
	],
	sourcemap: production ? false : 'inline',
	target: 'es2024',
	treeShaking: true,
})

// Debounce mechanism variables
// eslint-disable-next-line ts/no-restricted-types, unicorn/no-null
let rebuildTimeout: NodeJS.Timeout | null = null
let isRebuilding = false

/**
 * Trigger a rebuild and copy the generated file to the demo vault.
 */
async function triggerRebuild(): Promise<void> {
	if (isRebuilding) {
		return
	}

	isRebuilding = true
	console.log('Rebuilding...')
	try {
		await context.rebuild()
		console.log('Rebuild complete.')
		console.log('Copying files to demo vault...')

		await fs.mkdir('./examples/Renami Demo Vault/.obsidian/plugins/renami', { recursive: true })
		const distributionFiles = await fs.readdir('./dist')
		for (const file of distributionFiles) {
			await fs.copyFile(
				`./dist/${file}`,
				`./examples/Renami Demo Vault/.obsidian/plugins/renami/${file}`,
			)
		}

		// Create or update a .hotreload file in the demo vault to indicate a rebuild has occurred
		await fs.writeFile(
			'./examples/Renami Demo Vault/.obsidian/plugins/renami/.hotreload',
			new Date().toISOString(),
		)

		console.log('Files copied.')
	} catch (error) {
		console.error('Rebuild failed:', error)
	} finally {
		isRebuilding = false
	}
}

// Perform an initial rebuild and copy.
await triggerRebuild()

if (production) {
	// eslint-disable-next-line unicorn/no-process-exit
	process.exit(0)
}

console.log('Watching for changes using chokidar...')
// Set up the file watcher on the 'src' directory, ignoring initial add events.
const watcher = chokidar.watch('src', { ignoreInitial: true })

// On any file change, debounce and trigger a rebuild.
watcher.on('all', (event, path) => {
	console.log(`Detected ${event} on ${path}. Scheduling rebuild...`)
	if (rebuildTimeout) {
		clearTimeout(rebuildTimeout)
	}

	rebuildTimeout = setTimeout(() => {
		void triggerRebuild()
	}, 100)
})
