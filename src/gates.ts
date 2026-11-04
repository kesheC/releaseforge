import { GATE_LABELS } from "./types.js";
import type { GateContext, GateResult } from "./types.js";

/**
 * Release gates: the five checks that must pass before a tag is cut.
 * Each gate is a pure function over the context - the CLI gathers the
 * context from disk/git, tests build it by hand. No hidden state.
 */

function pass(id: keyof typeof GATE_LABELS): GateResult {
  return { id, label: GATE_LABELS[id], status: "pass" };
}

function fail(id: keyof typeof GATE_LABELS, detail: string): GateResult {
  return { id, label: GATE_LABELS[id], status: "fail", detail };
}

/** All five gates, in the order the CLI reports them. */
export function runGates(ctx: GateContext): GateResult[] {
  const results: GateResult[] = [];

  // 1. clean tree
  if (ctx.statusPorcelain.trim() === "") {
    results.push(pass("clean-tree"));
  } else {
    const n = ctx.statusPorcelain.trim().split("\n").length;
    results.push(fail("clean-tree", `${n} uncommitted change(s): run git status --porcelain`));
  }

  // 2. changelog section
  if (ctx.changelogBody === null) {
    results.push(fail("changelog-section", "CHANGELOG.md not found or unreadable"));
  } else if (/^##\s+\[Unreleased\]/m.test(ctx.changelogBody)) {
    results.push(pass("changelog-section"));
  } else {
    results.push(fail("changelog-section", "no ## [Unreleased] section to freeze; add one first"));
  }

  // 3. lockfile sync
  if (ctx.lockVersion === null) {
    // No lockfile is legal for a library without committed lockfile; the
    // playbook requires one, but the gate only fails on drift.
    results.push(pass("package-lock-sync"));
  } else if (ctx.lockVersion === ctx.pkgVersion) {
    results.push(pass("package-lock-sync"));
  } else {
    results.push(fail("package-lock-sync", `lockfile says ${ctx.lockVersion}, package.json says ${ctx.pkgVersion}; regenerate it`));
  }

  // 4. version constants in source
  const mismatched = Object.entries(ctx.versionConstants).filter(([, v]) => v !== ctx.pkgVersion);
  if (mismatched.length === 0) {
    results.push(pass("version-constant-sync"));
  } else {
    const first = mismatched[0]!;
    results.push(fail("version-constant-sync", `${first[0]} declares ${first[1]}, package.json says ${ctx.pkgVersion}`));
  }

  // 5. tag available
  const tag = `v${ctx.pkgVersion}`;
  if (ctx.existingTags.includes(tag)) {
    results.push(fail("tag-available", `tag ${tag} already exists; bump the version first`));
  } else {
    results.push(pass("tag-available"));
  }

  return results;
}
