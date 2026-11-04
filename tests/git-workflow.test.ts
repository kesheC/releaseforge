import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { systemGit } from "../src/git.js";
import { collectGateContext, commitsSinceLastTag, planRelease } from "../src/workflow.js";

/**
 * Real-git integration tests. Each test builds a throwaway repository in
 * the OS temp dir, commits conventionally, and asserts on what the workflow
 * glue reports. This is the layer where "git describe throws on no tags" and
 * "git log fails before the first commit" actually bite.
 */

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "rf-git-"));
  const git = (args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" });
  git(["init", "-q", "-b", "main", "."]);
  git(["config", "user.email", "test@example.com"]);
  git(["config", "user.name", "test"]);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function commit(file: string, subject: string): void {
  writeFileSync(join(root, file), "x\n", "utf8");
  execFileSync("git", ["add", file], { cwd: root, encoding: "utf8" });
  execFileSync("git", ["commit", "-qm", subject], { cwd: root, encoding: "utf8" });
}

describe("workflow on a real repo", () => {
  it("returns an empty plan before the first commit", () => {
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "t", version: "0.1.0" }), "utf8");
    const git = systemGit(root);
    const plan = planRelease(root, git);
    expect(plan.commits).toEqual([]);
    expect(plan.bump).toBe("none");
  });

  it("reads the version from package.json", () => {
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "t", version: "3.4.5" }), "utf8");
    const git = systemGit(root);
    const plan = planRelease(root, git);
    expect(plan.from).toBe("3.4.5");
  });

  it("classifies commits since the last tag", () => {
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "t", version: "0.1.0" }), "utf8");
    commit("a.txt", "feat: one");
    commit("b.txt", "fix: two");
    const git = systemGit(root);
    const commits = commitsSinceLastTag(git);
    // git log is newest-first: fix was committed after feat.
    expect(commits.map((c) => c.type)).toEqual(["fix", "feat"]);
    const plan = planRelease(root, git);
    expect(plan.bump).toBe("minor");
  });

  it("limits the range to the last tag", () => {
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "t", version: "0.1.0" }), "utf8");
    commit("a.txt", "feat: one");
    execFileSync("git", ["tag", "v0.1.0"], { cwd: root, encoding: "utf8" });
    commit("b.txt", "fix: two");
    const git = systemGit(root);
    expect(commitsSinceLastTag(git).map((c) => c.subject)).toEqual(["fix: two"]);
    expect(lastTagOf(root)).toBe("v0.1.0");
  });

  it("gates see a dirty tree and no changelog", () => {
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "t", version: "0.1.0" }), "utf8");
    commit("a.txt", "feat: one");
    writeFileSync(join(root, "stray.txt"), "uncommitted\n", "utf8");
    const git = systemGit(root);
    const ctx = collectGateContext(root, git);
    const failed = ctx.statusPorcelain.trim() !== "";
    expect(failed).toBe(true);
    expect(ctx.changelogBody).toBeNull();
  });

  it("collects version constants from src", () => {
    const srcDir = join(root, "src");
    require("node:fs").mkdirSync(srcDir);
    writeFileSync(join(srcDir, "cli.ts"), 'export const VERSION = "1.0.0";\n', "utf8");
    writeFileSync(join(root, "package.json"), JSON.stringify({ version: "1.0.0" }), "utf8");
    const git = systemGit(root);
    const ctx = collectGateContext(root, git);
    expect(ctx.versionConstants["src/cli.ts:VERSION"]).toBe("1.0.0");
  });
});

/** Helper kept at the bottom so the tests read top-down. */
function lastTagOf(root: string): string {
  const out = execFileSync("git", ["describe", "--tags", "--abbrev=0"], { cwd: root, encoding: "utf8" });
  return out.trim();
}