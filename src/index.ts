/**
 * Library API. The CLI is a thin argv parser over these functions; anything
 * the CLI can do, a test (or another tool) can do without spawning a process.
 */

export * from "./types.js";
export { parseVersion, bumpVersion } from "./semver.js";
export { parseCommitLine, bodyMarksBreaking, classify, planBump, releaseNotes } from "./commits.js";
export { parseSections, findSection, freezeUnreleased, parseLinkBlock, upsertLinks } from "./changelog.js";
export type { FreezeResult } from "./changelog.js";
export { runGates } from "./gates.js";
export type { GitRunner } from "./git.js";
export { systemGit, logSince, lastTag, listTags, statusPorcelain, currentBranch } from "./git.js";
export type { RawCommit } from "./git.js";
export { findVersionConstants, versionConstantMap } from "./version.js";
export type { VersionConstant } from "./version.js";
export { runPack } from "./pack.js";
export type { PackResult } from "./pack.js";
export { renderGates, renderPlan, renderGateSummary } from "./report.js";
export { collectGateContext, planRelease, readPkgVersion, readLockVersion, readChangelog, commitsSinceLastTag } from "./workflow.js";