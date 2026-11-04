import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Guard tests: structural promises that must not silently rot.
 * Each one exists because a regression really happened (or the playbook
 * mandates the shape). They read repo files, they do not run code.
 */

/** tsconfig files are JSONC (comments allowed), so strip // lines before parse. */
const read = (p: string): string =>
  readFileSync(new URL("../" + p, import.meta.url), "utf8").replace(/^\s*\/\/.*$/gm, "");

describe("tsconfig contract", () => {
  it("base typecheck layer covers src and tests with noEmit", () => {
    const ts = JSON.parse(read("tsconfig.json")) as {
      compilerOptions: Record<string, unknown>;
      include: string[];
    };
    expect(ts.compilerOptions.noEmit).toBe(true);
    expect(ts.compilerOptions.types).toEqual(["node"]);
    expect(ts.include).toEqual(expect.arrayContaining(["src", "tests"]));
  });

  it("build layer emits with an explicit noEmit:false and src-only rootDir", () => {
    const ts = JSON.parse(read("tsconfig.build.json")) as {
      compilerOptions: Record<string, unknown>;
      include: string[];
    };
    expect(ts.compilerOptions.noEmit).toBe(false);
    expect(ts.compilerOptions.rootDir).toBe("src");
    expect(ts.include).toEqual(["src"]);
  });
});

describe("CI workflow shape", () => {
  it("uses pinned action shas with version comments", () => {
    const yml = read(".github/workflows/ci.yml");
    const uses = yml.split("\n").filter((l) => l.includes("uses:"));
    expect(uses.length).toBeGreaterThan(0);
    for (const line of uses) {
      expect(line).toMatch(/@([0-9a-f]{40}) # v\d+\.\d+\.\d+$/);
    }
  });

  it("runs the audit gate after npm ci", () => {
    const yml = read(".github/workflows/ci.yml");
    const ciAt = yml.indexOf("- run: npm ci");
    const auditAt = yml.indexOf("npm audit --audit-level=high");
    expect(ciAt).toBeGreaterThan(-1);
    expect(auditAt).toBeGreaterThan(ciAt);
  });

  it("has a read-only permissions block", () => {
    const yml = read(".github/workflows/ci.yml");
    expect(yml).toContain("permissions:");
    expect(yml).toContain("contents: read");
  });
});

describe("package contract", () => {
  it("ships zero runtime dependencies", () => {
    const pkg = JSON.parse(read("package.json")) as { dependencies?: Record<string, string> };
    expect(pkg.dependencies ?? {}).toEqual({});
  });

  it("points the bin at the built CLI", () => {
    const pkg = JSON.parse(read("package.json")) as { bin: Record<string, string> };
    expect(pkg.bin.releaseforge).toBe("./dist/cli.js");
  });
});

describe("release workflow", () => {
  it("gates tag against package version before any gh call", () => {
    const yml = read(".github/workflows/release.yml");
    const gate = yml.indexOf("Verify tag matches");
    const firstGh = yml.indexOf("gh release create");
    expect(gate).toBeGreaterThan(-1);
    expect(firstGh).toBeGreaterThan(gate);
  });
});
