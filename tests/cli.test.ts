import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { main } from "../src/cli.js";

/**
 * In-process CLI tests: main() takes argv and returns the exit code, so the
 * suite never spawns a child process. The command paths that touch the real
 * working tree (plan/gates) run against THIS repository - the assertions
 * below are structural, not numeric, so they do not rot when the tree moves.
 */

describe("cli argv", () => {
  it("--help exits 0 and prints usage", () => {
    let out = "";
    const rc = main(["--help"], (s) => { out += s; });
    expect(rc).toBe(0);
    expect(out).toContain("Usage:");
    expect(out).toContain("releaseforge plan");
  });

  it("-h is the same as --help", () => {
    expect(main(["-h"], () => {})).toBe(0);
  });

  it("--version prints the package version", () => {
    let out = "";
    main(["--version"], (s) => { out += s; });
    expect(out).toMatch(/^releaseforge \d+\.\d+\.\d+\n$/);
  });

  it("no arguments prints usage and exits 0", () => {
    expect(main([], () => {})).toBe(0);
  });

  it("an unknown command exits 2 and prints usage on stderr", () => {
    let err = "";
    expect(main(["bogus"], () => {}, (s) => { err += s; })).toBe(2);
    expect(err).toContain("Usage:");
  });

  it("gates outside a git repository fails with a one-line error, not a stack", () => {
    const dir = mkdtempSync(join(tmpdir(), "rf-nogit-"));
    try {
      let err = "";
      const rc = main(["gates"], () => {}, (s) => { err += s; }, dir);
      expect(rc).toBe(2);
      expect(err).toContain("releaseforge:");
      expect(err).not.toMatch(/\n\s+at /); // no stack frames
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("plan runs against this repo and prints the plan header", () => {
    let out = "";
    const rc = main(["plan"], (s) => { out += s; });
    expect(rc).toBe(0);
    expect(out).toMatch(/release plan: \d+\.\d+\.\d+ -> \d+\.\d+\.\d+ \((major|minor|patch|none)\)/);
  });

  it("gates prints five gate lines with id + label", () => {
    let out = "";
    main(["gates"], (s) => { out += s; });
    for (const id of ["clean-tree", "changelog-section", "package-lock-sync", "version-constant-sync", "tag-available"]) {
      expect(out).toContain(id);
    }
    expect(out).toMatch(/\d gates/);
  });
});

