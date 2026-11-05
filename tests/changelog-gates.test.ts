import { describe, expect, it } from "vitest";

import { freezeUnreleased, parseLinkBlock, parseSections, upsertLinks } from "../src/changelog.js";
import { runGates } from "../src/gates.js";
import type { GateContext } from "../src/types.js";

const HEADED = [
  "# Changelog",
  "",
  "## [Unreleased]",
  "",
  "### Added",
  "- first thing",
  "",
  "## [0.1.0] - 2025-01-01",
  "",
  "### Added",
  "- initial",
  "",
].join("\n");

describe("parseSections", () => {
  it("finds sections with line numbers and trimmed bodies", () => {
    const s = parseSections(HEADED);
    expect(s.map((x) => x.title)).toEqual(["Unreleased", "0.1.0"]);
    expect(s[0]?.line).toBe(3);
    expect(s[0]?.body).toEqual(["", "### Added", "- first thing"]);
  });
});

describe("freezeUnreleased", () => {
  it("freezes Unreleased in place, keeping the body", () => {
    const r = freezeUnreleased(HEADED, "0.2.0", "2025-06-01");
    expect(r.frozeUnreleased).toBe(true);
    expect(r.createdSkeleton).toBe(false);
    expect(r.text).toContain("## [0.2.0] - 2025-06-01");
    expect(r.text).toContain("- first thing");
    expect(r.text).not.toContain("## [Unreleased]");
  });

  it("creates a skeleton when Unreleased is empty", () => {
    const empty = "# Changelog\n\n## [Unreleased]\n\n";
    const r = freezeUnreleased(empty, "0.1.0", "2025-06-01");
    expect(r.createdSkeleton).toBe(true);
    expect(r.text).toContain("### Added");
    expect(r.text).toContain("- First release of this changelog.");
  });

  it("creates the section when the changelog has none", () => {
    const bare = "# Changelog\n";
    const r = freezeUnreleased(bare, "0.1.0", "2025-06-01");
    expect(r.frozeUnreleased).toBe(false);
    expect(r.createdSkeleton).toBe(true);
    expect(r.text).toContain("## [0.1.0] - 2025-06-01");
  });
});

describe("upsertLinks", () => {
  it("adds Unreleased and version links above kept entries", () => {
    const t = upsertLinks(HEADED, "https://github.com/kesheC/releaseforge", "0.2.0", "0.1.0");
    const links = parseLinkBlock(t);
    expect(links).toContainEqual({
      title: "Unreleased",
      url: "https://github.com/kesheC/releaseforge/compare/v0.2.0...HEAD",
    });
    expect(links).toContainEqual({
      title: "0.2.0",
      url: "https://github.com/kesheC/releaseforge/compare/v0.1.0...v0.2.0",
    });
    expect(links.filter((l) => l.title === "Unreleased")).toHaveLength(1);
  });

  it("omits the version entry on first release (null prev)", () => {
    const t = upsertLinks("# C\n", "https://x/y", "0.1.0", null);
    const links = parseLinkBlock(t);
    expect(links.map((l) => l.title)).toEqual(["Unreleased"]);
  });

  it("keeps link entries it does not manage", () => {
    const seeded = "# C\n\n## [Unreleased]\n- x\n\n[0.1.0]: https://x/y/compare/v0.0.9...v0.1.0\n";
    const t = upsertLinks(seeded, "https://x/y", "0.2.0", "0.1.0");
    const links = parseLinkBlock(t);
    expect(links).toContainEqual({ title: "0.1.0", url: "https://x/y/compare/v0.0.9...v0.1.0" });
    expect(links.map((l) => l.title)).toEqual(["Unreleased", "0.2.0", "0.1.0"]);
  });

  it("is idempotent: running twice yields the same text", () => {
    const once = upsertLinks(HEADED, "https://x/y", "0.2.0", "0.1.0");
    const twice = upsertLinks(once, "https://x/y", "0.2.0", "0.1.0");
    expect(twice).toBe(once);
  });
});

describe("runGates", () => {
  const base: GateContext = {
    pkgVersion: "0.2.0",
    lockVersion: "0.2.0",
    changelogBody: "## [Unreleased]\n- x",
    statusPorcelain: "",
    versionConstants: { "src/cli.ts:VERSION": "0.2.0" },
    existingTags: ["v0.1.0"],
  };

  it("passes a clean context", () => {
    const r = runGates(base);
    expect(r.every((g) => g.status === "pass")).toBe(true);
    expect(r.map((g) => g.id)).toEqual([
      "clean-tree",
      "changelog-section",
      "package-lock-sync",
      "version-constant-sync",
      "tag-available",
    ]);
  });

  it.each([
    ["statusPorcelain", "M src/x.ts"],
    ["changelogBody", "# no sections"],
    ["lockVersion", "0.1.0"],
  ] as const)("fails the matching gate on bad %s", (key, value) => {
    const ctx = { ...base, [key]: value } as GateContext;
    const failed = runGates(ctx).filter((g) => g.status === "fail");
    expect(failed).toHaveLength(1);
  });

  it("fails version-constant-sync on any mismatch", () => {
    const r = runGates({ ...base, versionConstants: { "src/a.ts:V": "9.9.9" } });
    expect(r.find((g) => g.id === "version-constant-sync")?.status).toBe("fail");
  });

  it("fails tag-available when the tag exists, with a recovery hint", () => {
    const r = runGates({ ...base, existingTags: ["v0.2.0"] });
    const gate = r.find((g) => g.id === "tag-available");
    expect(gate?.status).toBe("fail");
    expect(gate?.detail).toContain("bump the version first");
    expect(gate?.detail).toContain("git tag -d v0.2.0");
  });
});

