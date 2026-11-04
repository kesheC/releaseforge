import type { BumpKind, ConventionalCommit } from "./types.js";

/**
 * Conventional Commits classifier.
 *
 * Spec basis: https://www.conventionalcommits.org/ - "type(scope)!: subject"
 * plus a BREAKING CHANGE footer. releaseforge deliberately recognizes only
 * the two kinds that move a version: feat (minor), fix (patch), and breaking
 * (major). Everything else is "none".
 */

const SUBJECT_RE = /^([a-zA-Z]+)(?:\(([^)]*)\))?(!)?: (.+)$/;

const TYPE_BUMP: Record<string, BumpKind> = {
  feat: "minor",
  fix: "patch",
};

/** Parse one "sha<sep>subject" pair as git log --pretty="%H%x00%s" emits it. */
export function parseCommitLine(line: string): ConventionalCommit | null {
  const sep = line.indexOf("\u0000");
  if (sep < 0 || sep === 0) return null;
  const sha = line.slice(0, sep).trim();
  const subject = line.slice(sep + 1).trim();
  if (!sha || !subject) return null;
  const m = SUBJECT_RE.exec(subject);
  if (!m) {
    // Not conventional: does not move the version on its own.
    return { sha, subject, type: "other", breaking: false, scope: null };
  }
  return {
    sha,
    subject,
    type: (m[1] ?? "other").toLowerCase(),
    scope: m[2] ? m[2].trim() || null : null,
    breaking: m[3] === "!",
  };
}

/**
 * True when the commit body carries a BREAKING CHANGE footer. The caller
 * supplies the body because git log emits it separately from the subject.
 * Matching follows the spec: a paragraph line that starts with the literal
 * "BREAKING CHANGE:" (the "BREAKING-CHANGE:" alias is accepted too).
 */
export function bodyMarksBreaking(body: string): boolean {
  return /^(BREAKING CHANGE|BREAKING-CHANGE):/m.test(body);
}

/** Merge a subject-parsed commit with its body verdict. */
export function classify(sha: string, subject: string, body: string): ConventionalCommit {
  const c = parseCommitLine(sha + "\u0000" + subject) ?? {
    sha,
    subject,
    type: "other" as const,
    breaking: false,
    scope: null,
  };
  if (!c.breaking && bodyMarksBreaking(body)) {
    c.breaking = true;
  }
  return c;
}

/** The strongest bump a set of commits implies. */
export function planBump(commits: ConventionalCommit[]): BumpKind {
  let bump: BumpKind = "none";
  for (const c of commits) {
    if (c.breaking) return "major";
    const b = TYPE_BUMP[c.type] ?? "none";
    if (b === "minor") bump = "minor";
    else if (b === "patch" && bump === "none") bump = "patch";
  }
  return bump;
}

/**
 * Human-readable release notes: one bullet per user-visible commit, grouped
 * breaking first. Docs/chore/test commits are excluded - they never ship in
 * the notes, only in the plan.
 */
export function releaseNotes(commits: ConventionalCommit[]): string[] {
  const visible = commits.filter((c) => c.breaking || c.type === "feat" || c.type === "fix");
  const breaking = visible.filter((c) => c.breaking);
  const rest = visible.filter((c) => !c.breaking);
  const lines: string[] = [];
  for (const c of breaking) {
    lines.push(`- **BREAKING**: ${c.subject} (${c.sha.slice(0, 7)})`);
  }
  for (const c of rest) {
    lines.push(`- ${c.subject} (${c.sha.slice(0, 7)})`);
  }
  return lines;
}