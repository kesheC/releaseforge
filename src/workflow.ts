import { readFileSync } from "node:fs";
import { join } from "node:path";

import { classify, planBump } from "./commits.js";
import { lastTag, listTags, logSince, statusPorcelain, type GitRunner } from "./git.js";
import { bumpVersion } from "./semver.js";
import { versionConstantMap } from "./version.js";
import type { ConventionalCommit, GateContext, ReleasePlan } from "./types.js";

/**
 * Workflow glue: the steps that read the repo on disk. Everything above this
 * layer is pure; everything below is git/npm. collectGateContext + planRelease
 * are what "releaseforge plan" and "releaseforge gates" execute.
 */

/** Read package.json version. Throws when the file is missing or malformed. */
export function readPkgVersion(root: string): string {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version?: string };
  if (!pkg.version) throw new Error("package.json has no version field");
  return pkg.version;
}

/** package-lock.json version, or null when the lockfile is absent. */
export function readLockVersion(root: string): string | null {
  try {
    const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8")) as { version?: string };
    return lock.version ?? null;
  } catch {
    return null;
  }
}

/** CHANGELOG.md text, or null when absent. */
export function readChangelog(root: string): string | null {
  try {
    return readFileSync(join(root, "CHANGELOG.md"), "utf8");
  } catch {
    return null;
  }
}

/** Classified commits since the last tag (all commits when no tag exists). */
export function commitsSinceLastTag(git: GitRunner): ConventionalCommit[] {
  const from = lastTag(git);
  return logSince(git, from).map((c) => classify(c.sha, c.subject, c.body));
}

/** Build the full gate context by reading the repo. */
export function collectGateContext(root: string, git: GitRunner): GateContext {
  return {
    pkgVersion: readPkgVersion(root),
    lockVersion: readLockVersion(root),
    changelogBody: readChangelog(root),
    statusPorcelain: statusPorcelain(git),
    versionConstants: versionConstantMap(root),
    existingTags: listTags(git),
  };
}

/** Compute the release plan: current version, bump, next version, commits. */
export function planRelease(root: string, git: GitRunner): ReleasePlan {
  const commits = commitsSinceLastTag(git);
  const from = readPkgVersion(root);
  const bump = planBump(commits);
  return { from, to: bumpVersion(from, bump), bump, commits };
}
