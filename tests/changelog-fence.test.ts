import { describe, expect, it } from "vitest";

import { freezeUnreleased, upsertLinks } from "../src/changelog.js";

// A changelog whose only heading-like lines live inside a fenced example:
// freeze must not treat fenced content as document structure.
const NO_UNRELEASED = [
  "# Changelog",
  "",
  "```md",
  "## [0.5.0] - fake-in-fence",
  "```",
  "",
  "Some prose mentioning [1.2.3]: https://example.com/link",
].join("\n");

describe("fenced headings in a changelog with no real Unreleased", () => {
  it("does not treat a fenced example heading as the first section", () => {
    const result = freezeUnreleased(NO_UNRELEASED, "0.2.0", "2025-06-01");
    expect(result.frozeUnreleased).toBe(false);
    expect(result.createdSkeleton).toBe(true);
    const lines = result.text.split("\n");
    const fenceIdx = lines.indexOf("```md");
    const headingIdx = lines.indexOf("## [0.2.0] - 2025-06-01");
    expect(fenceIdx).toBeGreaterThanOrEqual(0);
    expect(headingIdx).toBeGreaterThanOrEqual(0);
    // No real section exists (the fence does not count), so the skeleton is
    // appended at the end -- never inside the fence.
    expect(headingIdx).toBeGreaterThan(fenceIdx);
    const inner = lines.indexOf("## [0.5.0] - fake-in-fence");
    expect(inner).toBeGreaterThan(fenceIdx);
    expect(result.text).toContain("## [0.5.0] - fake-in-fence\n```");
  });
});

describe("asymmetric fences (CommonMark: only the same marker closes a fence)", () => {
  it("a tilde line does not close a backtick fence, so a real section after it still counts", () => {
    // ``` opens, ~~~ appears inside the block as content, then the block
    // closes with ```. A boolean flip treated ~~~ as the closer and
    // swallowed the real [0.1.0] section that follows.
    const text = [
      "# Changelog",
      "",
      "```md",
      "~~~",
      "example",
      "~~~",
      "```",
      "",
      "## [Unreleased]",
      "",
      "### Added",
      "- x",
    ].join("\n");
    const result = freezeUnreleased(text, "0.2.0", "2025-06-01");
    expect(result.frozeUnreleased).toBe(true);
    expect(result.text).toContain("## [0.2.0] - 2025-06-01");
    expect(result.text).not.toContain("## [Unreleased]");
  });

  it("a shorter run of the same marker does not close the fence", () => {
    const text = [
      "# Changelog",
      "",
      "````md",
      "```",
      "nested example",
      "```",
      "````",
      "",
      "## [Unreleased]",
      "",
      "### Added",
      "- x",
    ].join("\n");
    const result = freezeUnreleased(text, "0.2.0", "2025-06-01");
    expect(result.frozeUnreleased).toBe(true);
    expect(result.text).toContain("## [0.2.0] - 2025-06-01");
  });
});

describe("multiple [Unreleased] sections", () => {
  it("freeze refuses with a clear error instead of freezing only the first", () => {
    const text = [
      "# Changelog",
      "",
      "## [Unreleased]",
      "",
      "### Added",
      "- a",
      "",
      "## [Unreleased]",
      "",
      "### Fixed",
      "- b",
    ].join("\n");
    expect(() => freezeUnreleased(text, "0.2.0", "2025-06-01")).toThrow(/2 \[Unreleased\] sections/);
  });
});

describe("fenced link definitions", () => {
  it("keeps example link lines inside a code fence", () => {
    const text = upsertLinks(NO_UNRELEASED, "https://github.com/acme/widgets", "0.2.0", null);
    expect(text).toContain("[1.2.3]: https://example.com/link");
  });

  it("does not delete an owned example link that lives inside a fence", () => {
    // A tutorial-style fenced block showing what the link block looks like:
    // the example Unreleased line must survive upsertLinks untouched.
    const fenced = [
      "# Changelog",
      "",
      "```md",
      "[Unreleased]: https://example.com/compare/v0.1.0...HEAD",
      "```",
    ].join("\n");
    const text = upsertLinks(fenced, "https://github.com/acme/widgets", "0.2.0", null);
    expect(text).toContain("[Unreleased]: https://example.com/compare/v0.1.0...HEAD\n```");
  });

  it("still replaces real owned entries and keeps historical ones", () => {
    const text = upsertLinks(
      "\n[Unreleased]: https://github.com/acme/widgets/compare/v0.1.0...HEAD\n[0.1.0]: https://github.com/acme/widgets/compare/v0.0.9...v0.1.0\n",
      "https://github.com/acme/widgets", "0.2.0", "0.1.0");
    expect(text).toContain("[Unreleased]: https://github.com/acme/widgets/compare/v0.2.0...HEAD");
    expect(text).toContain("[0.2.0]: https://github.com/acme/widgets/compare/v0.1.0...v0.2.0");
    // The owned Unreleased entry is replaced, not duplicated.
    expect(text).not.toContain("v0.1.0...HEAD");
    // Historical version links are preserved.
    expect(text).toContain("[0.1.0]: https://github.com/acme/widgets/compare/v0.0.9...v0.1.0");
  });
});