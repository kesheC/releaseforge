import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { main } from "../src/cli.js";

/**
 * release/freeze command tests against a real throwaway repo. These cover
 * the write paths of the CLI: changelog freeze, release commit, tag, npm
 * pack. npm pack is offline-safe (it only reads the local tree).
 */

let root: string;

const git = (args: string[]): string =>
  execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "rf-cli-"));
  git(["init", "-q", "-b", "main", "."]);
  git(["config", "user.email", "test@example.com"]);
  git(["config", "user.name", "test"]);
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "rf-fixture", version: "0.1.0", private: true }), "utf8");
  writeFileSync(join(root, "CHANGELOG.md"), "# Changelog\n\n## [Unreleased]\n\n### Added\n- first\n\n", "utf8");
  writeFileSync(join(root, "src.txt"), "hello\n", "utf8");
  git(["add", "-A"]);
  git(["commit", "-qm", "feat: initial"]);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("cli freeze", () => {
  it("freezes Unreleased and writes compare links", () => {
    const rc = main(["freeze"], () => {}, () => {}, root);
    expect(rc).toBe(0);
    const text = readFileSync(join(root, "CHANGELOG.md"), "utf8");
    expect(text).toContain("## [0.1.0] - ");
    expect(text).not.toContain("## [Unreleased]");
    expect(text).toContain("[Unreleased]:");
  });

  it("fails cleanly when there is no changelog", () => {
    rmSync(join(root, "CHANGELOG.md"));
    let err = "";
    const rc = main(["freeze"], () => {}, (s) => { err += s; }, root);
    expect(rc).toBe(2);
    expect(err).toContain("no CHANGELOG.md");
  });

  it("dry run prints the freeze without writing CHANGELOG.md", () => {
    const before = readFileSync(join(root, "CHANGELOG.md"), "utf8");
    let out = "";
    const rc = main(["freeze", "--dry-run"], (s) => { out += s; }, () => {}, root);
    expect(rc).toBe(0);
    expect(out).toContain("dry run, would freeze [0.1.0]");
    expect(readFileSync(join(root, "CHANGELOG.md"), "utf8")).toBe(before);
  });
});

describe("cli release", () => {
  it("dry run prints the steps without writing a tag", () => {
    let out = "";
    const rc = main(["release", "--dry-run"], (s) => { out += s; }, () => {}, root);
    expect(rc).toBe(0);
    expect(out).toContain("dry run, would do:");
    expect(out).toContain("tag release");
    const tags = git(["tag", "--list"]).trim();
    expect(tags).toBe("");
  });

  it("gates-fail exit stops before any write", () => {
    writeFileSync(join(root, "dirty.txt"), "uncommitted\n", "utf8");
    let out = "";
    const rc = main(["release"], (s) => { out += s; }, () => {}, root);
    expect(rc).toBe(1);
    expect(out).toContain("clean-tree");
  });

  it("full release freezes, commits, tags, and packs", () => {
    let out = "";
    const rc = main(["release"], (s) => { out += s; }, () => {}, root);
    expect(rc).toBe(0);
    expect(out).toContain("done: freeze changelog -> commit changelog -> tag release -> npm pack");
    expect(git(["tag", "--list"]).trim()).toBe("v0.1.0");
    expect(out).toContain("rf-fixture-0.1.0.tgz");
    const tgz = join(root, "release", "rf-fixture-0.1.0.tgz");
    expect(existsSync(tgz)).toBe(true);
    // The release commit exists on top of the feature commit.
    const log = git(["log", "--oneline"]).trim().split("\n");
    expect(log[0]).toContain("chore(release): v0.1.0");
  });
});

