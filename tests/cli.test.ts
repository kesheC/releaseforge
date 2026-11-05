import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

  it("an unknown flag exits 2 with usage on stderr (typo'd --dry-run must not run)", () => {
    let err = "";
    const rc = main(["release", "--dryrun"], () => {}, (s) => { err += s; });
    expect(rc).toBe(2);
    expect(err).toContain("unknown option(s): --dryrun");
    expect(err).toContain("Usage:");
  });

  it("multiple unknown flags are all reported", () => {
    let err = "";
    const rc = main(["plan", "--json", "-x"], () => {}, (s) => { err += s; });
    expect(rc).toBe(2);
    expect(err).toContain("--json -x");
  });

  it("freeze without package.json exits 2 with a one-line error, not a stack", () => {
    const dir = mkdtempSync(join(tmpdir(), "rf-nopkg-"));
    try {
      writeFileSync(join(dir, "CHANGELOG.md"), "## [Unreleased]\n\n### Added\n- x\n", "utf8");
      let err = "";
      const rc = main(["freeze"], () => {}, (s) => { err += s; }, dir);
      expect(rc).toBe(2);
      expect(err).toContain("releaseforge:");
      expect(err).not.toMatch(/\n\s+at /); // no stack frames
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("freeze --dry-run without package.json also exits 2 (refuses before writing)", () => {
    const dir = mkdtempSync(join(tmpdir(), "rf-nopkg2-"));
    try {
      writeFileSync(join(dir, "CHANGELOG.md"), "## [Unreleased]\n", "utf8");
      let err = "";
      const rc = main(["freeze", "--dry-run"], () => {}, (s) => { err += s; }, dir);
      expect(rc).toBe(2);
      expect(err).toContain("releaseforge:");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses --dry-run on a path it cannot write (dry-run never bypasses hard errors)", () => {
    const dir = mkdtempSync(join(tmpdir(), "rf-nodry-"));
    try {
      let err = "";
      const rc = main(["freeze", "--dry-run"], () => {}, (s) => { err += s; }, dir);
      expect(rc).toBe(2);
      expect(err).toContain("no CHANGELOG.md");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("a second positional argument is refused like an unknown flag", () => {
    // "freeze extra" used to run freeze and silently drop the argument.
    let err = "";
    const rc = main(["freeze", "extra"], () => {}, (s) => { err += s; });
    expect(rc).toBe(2);
    expect(err).toContain("unknown option(s): extra");
    expect(err).toContain("Usage:");
  });
});
