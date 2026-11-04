import type { BumpKind } from "./types.js";

/**
 * Semver arithmetic. Kept deliberately tiny: releaseforge never needs ranges
 * or prerelease identifiers, just "0.1.4 plus a minor bump".
 */

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;

/** Parse an exact X.Y.Z version; throws on anything else. */
export function parseVersion(v: string): { major: number; minor: number; patch: number } {
  const m = SEMVER_RE.exec(v.trim());
  if (!m) {
    throw new Error(`not a plain X.Y.Z version: "${v}"`);
  }
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

/**
 * Apply a bump. "none" returns the input unchanged. Prerelease tags are not
 * supported on purpose: the release chain tags plain versions only.
 */
export function bumpVersion(from: string, bump: BumpKind): string {
  const v = parseVersion(from);
  switch (bump) {
    case "major":
      return `${v.major + 1}.0.0`;
    case "minor":
      return `${v.major}.${v.minor + 1}.0`;
    case "patch":
      return `${v.major}.${v.minor}.${v.patch + 1}`;
    case "none":
      return from;
  }
}
