# Changelog

All notable changes to this project are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Unknown flags (a typo like `--dryrun`) are refused with usage and exit 2 instead of silently ignored - the misspelled safety flag used to escalate to real writes.
- `freeze` refuses to run when the changelog already has a section for that version; double-freezing used to duplicate the heading with exit 0.
- `freeze` without a package.json (and a failed mid-release step) now prints a one-line error naming the failed step and completed steps with exit 2, instead of a stack trace after partial mutations.
- Compare links derived from credential-embedded origins (the CI checkout shape) work; a non-GitHub origin prints a fallback warning instead of pointing links at the wrong repo silently.
- Release notes in release.yml are anchored to the tag version, and refuse to ship when the section is missing (the v0.1.1 notes shipped the Unreleased body because of this).
- Changelog heading parsing ignores fenced code blocks, so an example `## [Unreleased]` inside a fence can no longer pass the gate or freeze prose.
- `freeze --dry-run` prints a one-line summary (the 0.1.1 note overstated this).
- npm pack no longer uses the deprecated `execFileSync` + shell + args-array form on Windows (DEP0190).

## [0.1.1] - 2026-11-05

### Fixed

- Quote `--pack-destination` on Windows so paths with spaces (or shell metacharacters) pack correctly.
- `freeze --dry-run` now prints the frozen section without writing anything.
- First releases no longer write a compare link that compares the version with itself.
- Gate failures outside a git repository exit 2 with a one-line error instead of a stack trace.
- A `tag-available` failure now suggests the exact recovery command (`git tag -d`).
- Changelog dates use the local calendar day instead of UTC.
- Unknown commands print usage to stderr with exit 2, and release cleanup keys the tarball off the package name.

## [0.1.0] - 2026-11-05

### Added

- Initial release: Conventional-Commits release planning, five release gates, CHANGELOG freeze with compare links, and tag-driven packaging.

