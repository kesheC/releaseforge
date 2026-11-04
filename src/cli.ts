#!/usr/bin/env node

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runGates } from "./gates.js";
import { freezeUnreleased, upsertLinks } from "./changelog.js";
import { releaseNotes } from "./commits.js";
import { systemGit } from "./git.js";
import { runPack } from "./pack.js";
import { renderGates, renderGateSummary, renderPlan } from "./report.js";
import { collectGateContext, planRelease, readPkgVersion } from "./workflow.js";

/**
 * CLI entry. Commands:
 *
 *   releaseforge plan             show the release plan (no writes)
 *   releaseforge gates            run the five release gates (no writes)
 *   releaseforge freeze           freeze [Unreleased] into the version section + links
 *   releaseforge release          gates + freeze + commit + tag + npm pack
 *
 * "release" stops short of pushing and of calling gh: pushing is the user's
 * network decision, and release.yml on the repo turns the pushed tag into a
 * GitHub Release with assets. That split keeps the CLI offline-safe and the
 * pipeline auditable.
 */

const VERSION = "0.1.0";

function usage(): string {
  return [
    "releaseforge " + VERSION,
    "",
    "Automate the npm release chain: plan, gates, changelog freeze, tag, pack.",
    "",
    "Usage:",
    "  releaseforge plan     Print the release plan derived from conventional commits.",
    "  releaseforge gates    Run the five release gates against the working tree.",
    "  releaseforge freeze   Freeze the [Unreleased] changelog section (writes CHANGELOG.md).",
    "  releaseforge release  Run gates, freeze, commit, tag, and npm pack locally.",
    "",
    "Options:",
    "  -h, --help      Show this help.",
    "  -V, --version   Print the version.",
    "  --dry-run       release only: print the steps without writing anything.",
  ].join("\n");
}

interface Parsed {
  command: string | null;
  help: boolean;
  version: boolean;
  dryRun: boolean;
}

function parseArgv(argv: string[]): Parsed {
  const p: Parsed = { command: null, help: false, version: false, dryRun: false };
  for (const a of argv) {
    if (a === "-h" || a === "--help") p.help = true;
    else if (a === "-V" || a === "--version") p.version = true;
    else if (a === "--dry-run") p.dryRun = true;
    else if (!a.startsWith("-") && p.command === null) p.command = a;
  }
  return p;
}

/** Previous version for the compare link. A changelog freeze only knows the
 * version being released; the release.yml workflow rewrites links from tags,
 * so the CLI writes the version entry with the same version on both sides
 * only when it cannot know better. Kept as a function so the policy has one
 * named home. */
function prevForLinks(version: string): string | null {
  return version;
}

/** Run one CLI invocation. Returns the process exit code. Exported for
 * tests: the suite calls this in-process instead of spawning a child. */
export function main(
  argv: string[],
  stdout: (s: string) => void = (s) => process.stdout.write(s),
  stderr: (s: string) => void = (s) => process.stderr.write(s),
  /** Optional root override; defaults to the process working directory. Tests pass a temp repo. */
  rootOverride?: string,
): number {
  const p = parseArgv(argv);
  if (p.help) {
    stdout(usage());
    return 0;
  }
  if (p.version) {
    stdout("releaseforge " + VERSION + "\n");
    return 0;
  }
  const root = rootOverride ?? process.cwd();
  const git = systemGit(root);

  switch (p.command) {
    case "plan": {
      const plan = planRelease(root, git);
      stdout(renderPlan(plan, releaseNotes(plan.commits)) + "\n");
      return 0;
    }
    case "gates": {
      const ctx = collectGateContext(root, git);
      const results = runGates(ctx);
      stdout(renderGates(results) + "\n\n" + renderGateSummary(results) + "\n");
      return results.some((r) => r.status === "fail") ? 1 : 0;
    }
    case "freeze": {
      const changelogPath = join(root, "CHANGELOG.md");
      let text: string;
      try {
        text = readFileSync(changelogPath, "utf8");
      } catch {
        stderr("releaseforge: no CHANGELOG.md in the current directory");
        return 2;
      }
      const version = readPkgVersion(root);
      const date = new Date().toISOString().slice(0, 10);
      const res = freezeUnreleased(text, version, date);
      const withLinks = upsertLinks(res.text, "https://github.com/kesheC/releaseforge", version, prevForLinks(version));
      writeFileSync(changelogPath, withLinks, "utf8");
      stdout("froze [" + version + "] into CHANGELOG.md (skeleton: " + res.createdSkeleton + ")\n");
      return 0;
    }
    case "release": {
      const ctx = collectGateContext(root, git);
      const results = runGates(ctx);
      stdout(renderGates(results) + "\n\n" + renderGateSummary(results) + "\n");
      if (results.some((r) => r.status === "fail")) return 1;
      const version = ctx.pkgVersion;
      const date = new Date().toISOString().slice(0, 10);
      const res = freezeUnreleased(ctx.changelogBody ?? "", version, date);
      const steps: string[] = [];
      const run = (name: string, fn: () => void): void => {
        if (p.dryRun) { steps.push(name); return; }
        fn();
        steps.push(name);
      };
      const changelogPath = join(root, "CHANGELOG.md");
      run("freeze changelog", () => {
        const withLinks = upsertLinks(res.text, "https://github.com/kesheC/releaseforge", version, prevForLinks(version));
        writeFileSync(changelogPath, withLinks, "utf8");
      });
      run("commit changelog", () => {
        git(["add", "CHANGELOG.md"]);
        git(["commit", "-m", "chore(release): v" + version]);
      });
      run("tag release", () => {
        git(["tag", "v" + version]);
      });
      let tarball = "";
      run("npm pack", () => {
        mkdirSync(join(root, "release"), { recursive: true });
        rmSync(join(root, "release", "releaseforge-" + version + ".tgz"), { force: true });
        const packed = runPack(root, join(root, "release"));
        tarball = packed.tarball;
      });
      const tail = tarball === "" ? "" : " (" + tarball + ")";
      stdout((p.dryRun ? "dry run, would do: " : "done: ") + steps.join(" -> ") + tail + "\n");
      return 0;
    }
    default:
      stdout(usage());
      return p.command === null ? 0 : 2;
  }
}

if (process.argv[1] !== undefined && import.meta.url === new URL("file:///" + process.argv[1].replace(/\\/g, "/")).href) {
  process.exit(main(process.argv.slice(2)));
}
