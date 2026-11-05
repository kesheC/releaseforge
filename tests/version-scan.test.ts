import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { findVersionConstants } from "../src/version.js";

/**
 * The version-constant scanner feeds the version-constant-sync gate, so a
 * false positive is a release blocker: a X.Y.Z string in a data constant
 * (protocol version, cache format) must not gate a release.
 */

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "rf-ver-"));
  mkdirSync(join(root, "src"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("findVersionConstants", () => {
  it("keeps identifiers whose name contains version", () => {
    writeFileSync(join(root, "src", "cli.ts"), 'export const VERSION = "1.2.3";\n', "utf8");
    expect(findVersionConstants(root)).toEqual([
      { file: "src/cli.ts", name: "VERSION", value: "1.2.3", line: 1 },
    ]);
  });

  it("ignores X.Y.Z strings in non-version identifiers", () => {
    writeFileSync(
      join(root, "src", "proto.ts"),
      'export const PROTOCOL = "1.0.0";\nexport const CACHE_LIMIT = "2.0.0";\n',
      "utf8",
    );
    expect(findVersionConstants(root)).toEqual([]);
  });

  it("skips comment lines and .d.ts files", () => {
    writeFileSync(
      join(root, "src", "a.ts"),
      '// export const VERSION = "9.9.9";\nexport const API_VERSION = "3.0.0";\n',
      "utf8",
    );
    writeFileSync(join(root, "src", "old.d.ts"), 'export const VERSION = "8.8.8";\n', "utf8");
    const found = findVersionConstants(root);
    expect(found).toHaveLength(1);
    expect(found[0]?.value).toBe("3.0.0");
  });
});
describe("cross-line version declarations", () => {
  it("captures the value when the string literal sits on a following line", () => {
    // The single-line regex reported nothing for this shape, so the gate
    // compared an empty result set with an empty set and passed a drift.
    writeFileSync(join(root, "src", "cli.ts"), 'export const VERSION =\n  "1.2.3";\n', "utf8");
    expect(findVersionConstants(root)).toEqual([
      { file: "src/cli.ts", name: "VERSION", value: "1.2.3", line: 2 },
    ]);
  });

  it("stops looking ahead at a blank line", () => {
    writeFileSync(join(root, "src", "cli.ts"), 'export const VERSION =\n\nexport const OTHER = "1.0.0";\n', "utf8");
    expect(findVersionConstants(root)).toEqual([]);
  });
});