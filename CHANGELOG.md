# Changelog

All notable changes to this project are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- nothing yet

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

