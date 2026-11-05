#!/usr/bin/env node

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { runGates } from "./gates.js";
import { freezeUnreleased, upsertLinks } from "./changelog.js";
import { releaseNotes } from "./commits.js";
import { lastTag, systemGit, type GitRunner } from "./git.js";
import { runPack } from "./pack.js";
import { renderGates, renderGateSummary, renderPlan } from "./report.js";
import { collectGateContext, planRelease, readPkgName, readPkgVersion } from "./workflow.js";

/** Derive the GitHub repo URL from the origin remote; falls back to the releaseforge default. */
export function deriveRepoUrl(root: string, git: (args: string[]) => string): string {
  let url = "";
  try {
    url = git(["remote", "get-url", "origin"]).trim();
  } catch {
    url = "";
  }
  const https = url.match(/^https:\/\/github\.com\/([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/);
  const ssh = url.match(/^git@github\.com:([\w.-]+\/[\w.-]+?)(?:\.git)?$/);
  const m = https ?? ssh;
  return m ? "https://github.com/" + m[1] : "https://github.com/kesheC/releaseforge";
}

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

const VERSION = "0.1.1";

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
    "  --dry-run       print the steps without writing anything (release, freeze).",
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

/** Today in the local zone as YYYY-MM-DD. An ISO-UTC slice wrote yesterday's
 * date for evening releases east of Greenwich. */
function localDate(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return d.getFullYear() + "-" + mm + "-" + dd;
}

/** Previous version for the compare link: the last tag reachable from HEAD
 * without its v prefix, or null when the repo has no tags yet. upsertLinks
 * omits the version entry for a null previous, so a first release no longer
 * writes a version-compared-to-itself dead link. */
function prevForLinks(git: GitRunner): string | null {
  const tag = lastTag(git);
  if (tag === null) return null;
  return tag.startsWith("v") ? tag.slice(1) : tag;
}

/** First readable line of a failed child call (git/npm). execFileSync errors
 * carry the whole stderr blob in message; a CLI failure should be one line,
 * not a stack. */
function childReason(err: unknown): string {
  const e = err as { message?: string; stderr?: unknown };
  const blob = typeof e.stderr === "string" && e.stderr.trim() !== "" ? e.stderr : (e.message ?? String(err));
  return blob.trim().split(/\r?\n/)[0] ?? String(err);
}

/** collectGateContext with a one-line failure report. Running outside a git
 * repository used to print a raw stack; now it prints git's own first line. */
function gateContext(
  root: string,
  git: GitRunner,
  stderr: (s: string) => void,
): ReturnType<typeof collectGateContext> | null {
  try {
    return collectGateContext(root, git);
  } catch (err) {
    stderr("releaseforge: " + childReason(err) + "\n");
    return null;
  }
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
      let plan: ReturnType<typeof planRelease>;
      try {
        plan = planRelease(root, git);
      } catch (err) {
        stderr("releaseforge: " + childReason(err) + "\n");
        return 2;
      }
      stdout(renderPlan(plan, releaseNotes(plan.commits)) + "\n");
      return 0;
    }
    case "gates": {
      const ctx = gateContext(root, git, stderr);
      if (ctx === null) return 2;
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
        stderr("releaseforge: no CHANGELOG.md in the current directory\n");
        return 2;
      }
      const version = readPkgVersion(root);
      const res = freezeUnreleased(text, version, localDate());
      if (p.dryRun) {
        stdout("dry run, would freeze [" + version + "] into CHANGELOG.md (skeleton: " + res.createdSkeleton + ")\n");
        return 0;
      }
      const withLinks = upsertLinks(res.text, deriveRepoUrl(root, git), version, prevForLinks(git));
      writeFileSync(changelogPath, withLinks, "utf8");
      stdout("froze [" + version + "] into CHANGELOG.md (skeleton: " + res.createdSkeleton + ")\n");
      return 0;
    }
    case "release": {
      const ctx = gateContext(root, git, stderr);
      if (ctx === null) return 2;
      const results = runGates(ctx);
      stdout(renderGates(results) + "\n\n" + renderGateSummary(results) + "\n");
      if (results.some((r) => r.status === "fail")) return 1;
      const version = ctx.pkgVersion;
      const res = freezeUnreleased(ctx.changelogBody ?? "", version, localDate());
      const steps: string[] = [];
      const run = (name: string, fn: () => void): void => {
        if (p.dryRun) { steps.push(name); return; }
        fn();
        steps.push(name);
      };
      const changelogPath = join(root, "CHANGELOG.md");
      run("freeze changelog", () => {
        const withLinks = upsertLinks(res.text, deriveRepoUrl(root, git), version, prevForLinks(git));
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
        // The tarball is <pkg.name>-<version>.tgz: derive the stale-file
        // pre-clean from the package name instead of a hardcoded prefix, or
        // the cleanup silently misses every other package.
        rmSync(join(root, "release", readPkgName(root) + "-" + version + ".tgz"), { force: true });
        const packed = runPack(root, join(root, "release"));
        tarball = packed.tarball;
      });
      const tail = tarball === "" ? "" : " (" + tarball + ")";
      stdout((p.dryRun ? "dry run, would do: " : "done: ") + steps.join(" -> ") + tail + "\n");
      return 0;
    }
    default:
      if (p.command === null) {
        stdout(usage());
        return 0;
      }
      stderr(usage() + "\n");
      return 2;
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)));
}
