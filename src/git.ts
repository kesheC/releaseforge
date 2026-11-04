import { execFileSync } from "node:child_process";

/**
 * Thin git wrapper. Every call goes through runGit so tests can swap the
 * backend without spawning processes (DependencyRunner pattern), and so the
 * CLI has exactly one place where git is actually executed.
 */

export type GitRunner = (args: string[]) => string;

export function systemGit(cwd: string): GitRunner {
  return (args: string[]) =>
    execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      // Expected failures (no tags, no commits) surface as caught exceptions;
      // piping stops git from also spraying its stderr into ours.
      stdio: ["ignore", "pipe", "pipe"],
    });
}

/** Full sha + subject + body, NUL-separated, for every commit since ref. */
export interface RawCommit {
  sha: string;
  subject: string;
  body: string;
}

export function logSince(git: GitRunner, fromRef: string | null): RawCommit[] {
  const range = fromRef ? `${fromRef}..HEAD` : "HEAD";
  let out: string;
  try {
    // Each record STARTS with a NUL: "\0sha\0subject\0body". Subjects and
    // bodies cannot contain NUL, so a single-NUL split yields clean triples
    // regardless of empty bodies (an empty body would otherwise make the
    // trailing separator ambiguous).
    out = git(["log", "--pretty=%x00%H%x00%s%x00%b", "--no-merges", range]);
  } catch {
    // No commits yet (fresh repository): an empty plan, not a crash.
    return [];
  }
  const fields = out.split("\u0000");
  const commits: RawCommit[] = [];
  // fields.length is 3n + 1: "" + n triples. i = 1, 4, ... steps of 3 reach
  // every triple including the last (i + 2 = 3n < 3n + 1).
  for (let i = 1; i + 2 < fields.length; i += 3) {
    const sha = fields[i]?.trim() ?? "";
    const subject = fields[i + 1] ?? "";
    const body = fields[i + 2] ?? "";
    if (!sha || !subject) continue;
    commits.push({ sha, subject, body });
  }
  return commits;
}

/** Last tag reachable from HEAD, or null when the repo has no tags. */
export function lastTag(git: GitRunner): string | null {
  let out: string;
  try {
    out = git(["describe", "--tags", "--abbrev=0"]);
  } catch {
    return null;
  }
  const t = out.trim();
  return t === "" ? null : t;
}

/** All local tag names. */
export function listTags(git: GitRunner): string[] {
  let out = "";
  try {
    out = git(["tag", "--list"]);
  } catch {
    return [];
  }
  return out.split(/\r?\n/).map((s) => s.trim()).filter((s) => s !== "");
}

/** git status --porcelain output verbatim. */
export function statusPorcelain(git: GitRunner): string {
  return git(["status", "--porcelain"]);
}

/** Current branch name (empty string in detached HEAD). */
export function currentBranch(git: GitRunner): string {
  try {
    const out = git(["rev-parse", "--abbrev-ref", "HEAD"]);
    return out.trim();
  } catch {
    return "";
  }
}