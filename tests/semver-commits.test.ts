import { describe, expect, it } from "vitest";

import { bodyMarksBreaking, classify, parseCommitLine, planBump, releaseNotes } from "../src/commits.js";
import { bumpVersion, parseVersion } from "../src/semver.js";
import type { ConventionalCommit } from "../src/types.js";

describe("parseVersion", () => {
  it("parses plain versions", () => {
    expect(parseVersion("0.1.0")).toEqual({ major: 0, minor: 1, patch: 0 });
  });

  it("rejects prerelease and bare numbers", () => {
    expect(() => parseVersion("1.2")).toThrow();
    expect(() => parseVersion("1.2.3-beta.1")).toThrow();
  });
});

describe("bumpVersion", () => {
  it.each([
    ["major", "1.2.3", "2.0.0"],
    ["minor", "1.2.3", "1.3.0"],
    ["patch", "1.2.3", "1.2.4"],
    ["none", "1.2.3", "1.2.3"],
  ] as const)("applies %s to %s -> %s", (bump, from, want) => {
    expect(bumpVersion(from, bump)).toBe(want);
  });
});

describe("parseCommitLine", () => {
  it("parses feat with scope", () => {
    const c = parseCommitLine("abc123\u0000feat(cli): add plan command");
    expect(c).toMatchObject({ type: "feat", scope: "cli", breaking: false, sha: "abc123" });
  });

  it("parses breaking ! marker", () => {
    const c = parseCommitLine("abc123\u0000feat!: drop node 18");
    expect(c?.breaking).toBe(true);
  });

  it("marks non-conventional subjects as other", () => {
    const c = parseCommitLine("abc123\u0000just some text");
    expect(c?.type).toBe("other");
  });

  it("rejects lines without the NUL separator", () => {
    expect(parseCommitLine("abc123 feat: no separator")).toBeNull();
  });
});

describe("bodyMarksBreaking", () => {
  it("accepts the spec footer and the hyphen alias", () => {
    expect(bodyMarksBreaking("context\n\nBREAKING CHANGE: gone")).toBe(true);
    expect(bodyMarksBreaking("BREAKING-CHANGE: renamed")).toBe(true);
  });

  it("ignores prose mentioning breaking changes", () => {
    expect(bodyMarksBreaking("this is not a BREAKING CHANGE: report")).toBe(false);
  });
});

describe("planBump", () => {
  const mk = (type: string, breaking = false): ConventionalCommit => ({
    sha: "s", subject: type + ": x", type, breaking, scope: null,
  });

  it("short-circuits on breaking", () => {
    expect(planBump([mk("fix"), mk("feat", true)])).toBe("major");
  });

  it("minor beats patch", () => {
    expect(planBump([mk("fix"), mk("feat")])).toBe("minor");
  });

  it("patch from fixes only", () => {
    expect(planBump([mk("fix")])).toBe("patch");
  });

  it("none for docs/chore only", () => {
    expect(planBump([mk("docs"), mk("chore")])).toBe("none");
  });

  it("none for an empty release", () => {
    expect(planBump([])).toBe("none");
  });
});

describe("classify", () => {
  it("promotes breaking from the body footer", () => {
    const c = classify("sha", "feat: thing", "body\nBREAKING CHANGE: flag removed");
    expect(c.breaking).toBe(true);
  });
});

describe("releaseNotes", () => {
  it("lists breaking first, drops docs/chore", () => {
    const notes = releaseNotes([
      classify("aaaaaaa", "docs: readme", ""),
      classify("bbbbbbb", "fix: leak", ""),
      classify("ccccccc", "feat!: new api", ""),
    ]);
    expect(notes).toEqual([
      "- **BREAKING**: feat!: new api (ccccccc)",
      "- fix: leak (bbbbbbb)",
    ]);
  });
});

