import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Version-constant discovery.
 *
 * The chain must keep package.json in sync with any version string printed at
 * runtime (--version output). Repos declare the constant in one source file;
 * releaseforge finds declarations of the shape
 *
 *   export const VERSION = "1.2.3"        (const / let, single or double quotes)
 *
 * in TypeScript files under src/ and reports every value found. Only
 * identifiers whose name contains "version" (any case) count - a X.Y.Z
 * string in some other constant is data, not the shipped version.
 */

const DECL_RE = /(?:export\s+)?(?:const|let)\s+([A-Za-z_$][\w$]*)\s*(?::\s*string\s*)?=\s*["'](\d+\.\d+\.\d+)["']/g;

/** The scanner feeds the version-constant-sync gate, so only identifiers
 * whose name contains "version" (any case) are treated as version constants. */
function isVersionName(name: string): boolean {
  return /version/i.test(name);
}

export interface VersionConstant {
  /** Path relative to root, forward slashes. */
  file: string;
  /** Identifier name, e.g. VERSION. */
  name: string;
  /** Declared X.Y.Z value. */
  value: string;
  /** 1-based line number. */
  line: number;
}

/** Walk src/ recursively, collecting .ts files (skip .d.ts). */
function tsFiles(dir: string, rel: string): string[] {
  let out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir, { withFileTypes: true }).map((e) => e.name);
  } catch {
    return out;
  }
  for (const name of entries.sort()) {
    const abs = join(dir, name);
    const relPath = rel ? `${rel}/${name}` : name;
    let isDir: boolean;
    try {
      readdirSync(abs);
      isDir = true;
    } catch {
      isDir = false;
    }
    if (isDir) {
      out = out.concat(tsFiles(abs, relPath));
    } else if (name.endsWith(".ts") && !name.endsWith(".d.ts")) {
      out.push(relPath);
    }
  }
  return out;
}

/** Scan all TypeScript files under <root>/src for version constants. */
export function findVersionConstants(root: string): VersionConstant[] {
  const srcDir = join(root, "src");
  const files = tsFiles(srcDir, "src");
  const found: VersionConstant[] = [];
  for (const rel of files) {
    const text = readFileSync(join(root, rel), "utf8");
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i] ?? "";
      // Skip comment lines: the doc comment in this very file shows an
      // example declaration, and a scanner that reads its own examples
      // would report a version the code never ships.
      const t = raw.trim();
      if (t.startsWith("*") || t.startsWith("//") || t.startsWith("/*")) continue;
      DECL_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = DECL_RE.exec(raw)) !== null) {
        // A X.Y.Z string in PROTOCOL or CACHE_LIMIT is data, not the shipped
        // version, and must not gate a release (the scanner used to match
        // any identifier).
        if (!isVersionName(m[1]!)) continue;
        found.push({ file: rel, name: m[1]!, value: m[2]!, line: i + 1 });
      }
    }
  }
  return found;
}

/** versionConstants map for GateContext: "src/file.ts:name" -> value. */
export function versionConstantMap(root: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const c of findVersionConstants(root)) {
    map[`${c.file}:${c.name}`] = c.value;
  }
  return map;
}