import type { GateResult, ReleasePlan } from "./types.js";

/**
 * Console report rendering. Pure string builders - the CLI prints what these
 * return, tests assert on them. No color codes: release output lands in CI
 * logs where ANSI escapes are noise.
 */

/** "  ok  clean-tree  work tree has no uncommitted changes" style lines. */
export function renderGates(results: GateResult[]): string {
  return results
    .map((r) => {
      const mark = r.status === "pass" ? "ok  " : "FAIL";
      const detail = r.detail ? ` - ${r.detail}` : "";
      return `  ${mark}  ${r.id}  ${r.label}${detail}`;
    })
    .join("\n");
}

export function renderPlan(plan: ReleasePlan, notes: string[]): string {
  const lines = [
    `release plan: ${plan.from} -> ${plan.to} (${plan.bump})`,
    `commits considered: ${plan.commits.length}`,
    "",
    "release notes:",
    ...(notes.length > 0 ? notes : ["  (no user-visible commits; notes will be a skeleton)"]),
  ];
  return lines.join("\n");
}

export function renderGateSummary(results: GateResult[]): string {
  const failed = results.filter((r) => r.status === "fail");
  if (failed.length === 0) return `${results.length} gates, all pass`;
  return `${results.length} gates, ${failed.length} failed: ${failed.map((f) => f.id).join(", ")}`;
}
