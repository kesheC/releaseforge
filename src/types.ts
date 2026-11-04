/**
 * Core types for releaseforge.
 *
 * Every stage of the release chain produces a typed, serializable result so
 * that the CLI can print it and the tests can assert on it without shelling
 * out to git.
 */

export const BUMP_KINDS = ["major", "minor", "patch", "none"] as const;
export type BumpKind = (typeof BUMP_KINDS)[number];

/** One conventional commit, already classified. */
export interface ConventionalCommit {
  /** 40-char (or shorter) commit sha as produced by git log. */
  sha: string;
  /** The subject line, first line of the message. */
  subject: string;
  /** lower-case type: feat | fix | docs | chore | refactor | test | perf | build | ci | style | revert */
  type: string;
  /** Breaking-change marker: subject contains "!" or the body has a BREAKING CHANGE footer. */
  breaking: boolean;
  /** Scopes from the subject, e.g. "feat(cli):" -> "cli". */
  scope: string | null;
}

/** The release plan a repo gets from its commits. */
export interface ReleasePlan {
  /** Version this release starts from, read from package.json. */
  from: string;
  /** Version this release would produce. */
  to: string;
  /** Which semver component moves, or "none" when nothing does. */
  bump: BumpKind;
  /** Conventional commits found between the last tag and HEAD. */
  commits: ConventionalCommit[];
}

export const GATE_IDS = [
  "clean-tree",
  "changelog-section",
  "package-lock-sync",
  "version-constant-sync",
  "tag-available",
] as const;
export type GateId = (typeof GATE_IDS)[number];

export const GATE_LABELS: Record<GateId, string> = {
  "clean-tree": "work tree has no uncommitted changes",
  "changelog-section": "CHANGELOG.md has an [Unreleased] section to freeze",
  "package-lock-sync": "package-lock.json version matches package.json",
  "version-constant-sync": "declared version constants match package.json",
  "tag-available": "the release tag does not exist yet",
};

export type GateStatus = "pass" | "fail";

export interface GateResult {
  id: GateId;
  label: string;
  status: GateStatus;
  /** Human-readable detail, present when status is fail. */
  detail?: string;
}

/** Input for the gates stage. */
export interface GateContext {
  pkgVersion: string;
  lockVersion: string | null;
  changelogBody: string | null;
  /** Uncommitted changes as git status --porcelain lines; empty string = clean. */
  statusPorcelain: string;
  /** Version constants found in source files (file -> declared version). */
  versionConstants: Record<string, string>;
  /** Tags that already exist locally. */
  existingTags: string[];
}

/** A CHANGELOG section, one "## [x]" block. */
export interface ChangelogSection {
  /** The heading text between brackets, e.g. "Unreleased" or "0.2.0". */
  title: string;
  /** Body lines under the heading (without the heading itself). */
  body: string[];
  /** Line number (1-based) of the heading in the file. */
  line: number;
}

export interface PackInfo {
  /** Resolved tarball file name, e.g. releaseforge-0.2.0.tgz */
  tarball: string;
  /** File size in bytes. */
  bytes: number;
  /** sha256 hex digest of the tarball. */
  sha256: string;
}
