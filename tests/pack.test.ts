import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runPack } from "../src/pack.js";

/**
 * npm pack through a destination whose path contains a space. On Windows
 * execFileSync spawns npm through a shell that re-joins the argv, so the
 * destination must be quoted by runPack itself - this test is the proof
 * that quoting works on the platform where it matters.
 */

let root: string;
let dest: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "rf-pack-"));
  dest = join(root, "out dir"); // the space is the point
  mkdirSync(dest);
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "rf-pack-fixture", version: "0.1.0", private: true }),
    "utf8",
  );
  writeFileSync(join(root, "index.js"), "export {};\n", "utf8");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("runPack", () => {
  it("packs into a destination whose path contains spaces", () => {
    const r = runPack(root, dest);
    expect(r.tarball).toBe("rf-pack-fixture-0.1.0.tgz");
    expect(r.bytes).toBeGreaterThan(0);
    expect(r.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});
