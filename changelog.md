# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Maintenance

- Standardize build and development cleanup on `shx`, remove `rimraf`, and rename `renami:local-deploy` to `renami:deploy-local`.

## [0.3.2] - 2026-11-02

### Maintenance

- Update the bundled Renami dependency requirement to `^0.3.4`.
- Refresh contributor tooling to shared-config 8.14, chokidar 6, obsidian-typings 6.56, and pnpm 12.16.1, and remove expired release-age exemptions.
- Use pnpm-managed shared-config skills instead of the standalone `skills` package and prepare hook, and simplify deep cleanup.
- Refresh release automation and give dependency-update pull requests a consistent title.

## [0.3.1] - 2026-10-14

### Maintenance

- Update the bundled Renami dependency requirement to `^0.3.3`.
- Refresh shared configuration, Node.js and Obsidian typings, pnpm, and CI/release actions, and simplify dependency and TypeScript settings.
- Ignore loopback URLs and allow empty input sets in automated link checks.
- Run automated dependency updates monthly instead of weekly.

## [0.3.0] - 2026-10-06

### Changed

- Update bundled Renami to `^0.3.2`, changing filename sanitization in some edge cases through its filenamify update.

### Maintenance

- Refresh development dependencies and lint/type configuration, migrate to pnpm 12, and set contributor Node.js requirements to `^24.16.0 || >=26.3.0`.
- Add automatic contributor-skill synchronization during installation and rename the cleanup script to `clean-deep`.
- Add weekly automated dependency-update pull requests.
- Refresh and pin release and metadata workflow actions, and correct sitemap error capture during link checks.

## [0.2.0] - 2026-09-01

### Changed

- **Breaking:** Require Obsidian 1.13.4+ and target ES2024 in plugin bundles, requiring Chromium 112+.
- Use Obsidian's native declarative settings groups and reorderable template lists.

### Fixed

- Validate maximum filename length, automatic rename delay, and fallback names, and repair invalid saved values on startup.
- Keep folder and template edits attached to the correct rule after reordering rows.
- Persist normalized folder and template rules when closing settings.

### Documentation

- Update installation prerequisites to document Obsidian 1.13.4+.

### Maintenance

- Update the bundled Renami dependency requirement to `^0.3.0`.
- Refresh development dependencies for TypeScript 6 and Node.js 24.16+, add editor lint tasks, and remove SortableJS after adopting native settings controls.
- Add scheduled link checking and a general GitHub release workflow, and refresh CI and plugin-release actions.

## [0.1.2] - 2026-05-17

### Documentation

- Correct the README's MIT license link.

### Maintenance

- Update the bundled Renami dependency requirement to `^0.2.0`.
- Migrate contributor tooling to pnpm 11 and Node.js 22.22.2+, refresh development dependencies and workflow actions, and use cross-platform cleanup and deployment commands.
- Add build-provenance attestations for plugin release artifacts.

## [0.1.1] - 2026-04-07

### Documentation

- Recommend Iconize for associating icons with notes without changing their filenames.

### Maintenance

- Update the bundled Renami dependency requirement to `^0.1.1`.
- Add CI builds and lint checks on Linux, macOS, and Windows.
- Refresh build, lint, and release dependencies, pin workflow actions, and declare Node.js 22.18+ for contributor tooling.

## [0.1.0] - 2026-03-12

### Added

- Introduce a desktop Obsidian 1.12.4+ plugin that generates Markdown note filenames from frontmatter properties and CSS-like content selectors, with chained case, number, date, and length formatting.
- Configure recursive folder/template rules with folder suggestions and drag-to-reorder precedence.
- Run renaming through the `Renami: Update note file names` command or settings button, or enable automatic renaming at startup and after note or rule changes.
- Customize filename casing, whitespace, trimming, delimiters, and maximum length, including elision text and truncation at word boundaries.
- Sanitize invalid filename characters and resolve name collisions with numeric increments.
- Rename notes through Obsidian's file manager so links update when filenames change.
- Optionally exclude folder notes and choose whether unsuccessful templates preserve existing filenames or use a configurable strict-mode fallback.
- Persist rules and options and copy equivalent standalone Renami JSON configuration to the clipboard.
- Show rename results, errors, and conflicts through notices, with optional verbose output, locally saved run statistics, and the last rename time in settings.

### Documentation

- Provide manual installation instructions for GitHub release bundles, command and settings guides, template syntax references, and privacy documentation.
- Add a demo vault and examples for frontmatter titles, headings, content prefixes, and workflows comparable to other filename plugins.

### Maintenance

- Set up TypeScript/esbuild bundling, manifest generation, shared lint tooling, demo-vault hot reload, and automated GitHub releases using the published Renami package.

[Unreleased]: https://github.com/kitschpatrol/renami-obsidian/compare/0.3.2...HEAD
[0.1.0]: https://github.com/kitschpatrol/renami-obsidian/releases/tag/0.1.0
[0.1.1]: https://github.com/kitschpatrol/renami-obsidian/compare/0.1.0...0.1.1
[0.1.2]: https://github.com/kitschpatrol/renami-obsidian/compare/0.1.1...0.1.2
[0.2.0]: https://github.com/kitschpatrol/renami-obsidian/compare/0.1.2...0.2.0
[0.3.0]: https://github.com/kitschpatrol/renami-obsidian/compare/0.2.0...0.3.0
[0.3.1]: https://github.com/kitschpatrol/renami-obsidian/compare/0.3.0...0.3.1
[0.3.2]: https://github.com/kitschpatrol/renami-obsidian/compare/0.3.1...0.3.2
