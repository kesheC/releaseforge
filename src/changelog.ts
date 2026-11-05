import type { ChangelogSection } from "./types.js";

/**
 * Keep-a-Changelog section reader/writer.
 *
 * The chain freezes "## [Unreleased]" into "## [X.Y.Z] - date" and inserts a
 * compare link. Parsing is line-based and tolerant: it only needs to find
 * heading lines, not validate the whole document.
 */

const HEADING_RE = /^##\s+\[([^\]]+)\]\s*(?:-\s*(.*))?$/;
const LINK_RE = /^\[(Unreleased|\d+\.\d+\.\d+)\]:\s*(\S+)\s*$/;

/**
 * Fence state for one pass over a markdown document. CommonMark closes a
 * fence with a line of the SAME character running at least as long as the
 * opener, so a backtick block is not closed by tildes (and a 3-backtick
 * opener is not closed by a 5-backtick line). A boolean flip used to swallow
 * a real section after a mismatched fence, or worse, write two identical
 * version headings on freeze. Feed every raw line to next(); insideFence()
 * tells whether a structural line (heading, link) counts as document
 * structure or as fenced content.
 */
export class FenceTracker {
  private char: string | null = null;
  private len = 0;

  next(line: string): void {
    const m = /^(\s*)(`{3,}|~{3,})/.exec(line);
    if (m) {
      const marker = m[2]!;
      const ch = marker[0]!;
      if (this.char === null) {
        this.char = ch;
        this.len = marker.length;
      } else if (ch === this.char && marker.length >= this.len) {
        this.char = null;
        this.len = 0;
      }
    }
  }

  insideFence(): boolean {
    return this.char !== null;
  }
}

/** Parse every "## [title]" section. Content before the first one is ignored.
 * Heading lines inside fenced code blocks (``` or ~~~) are prose, not
 * sections: freeze once froze a fenced example instead of a real section. */
export function parseSections(text: string): ChangelogSection[] {
  const lines = text.split(/\r?\n/);
  const sections: ChangelogSection[] = [];
  let current: ChangelogSection | null = null;
  const fence = new FenceTracker();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const inside = fence.insideFence();
    fence.next(line);
    const m = inside ? null : HEADING_RE.exec(line);
    if (m && m[1] !== undefined) {
      const section: ChangelogSection = { title: m[1], body: [], line: i + 1 };
      current = section;
      sections.push(section);
      continue;
    }
    if (current) current.body.push(line);
  }
  // Trim trailing empty lines of each section: they are separators, not content.
  for (const s of sections) {
    while (s.body.length > 0 && s.body[s.body.length - 1] === "") s.body.pop();
  }
  return sections;
}

/** Locate a section by exact title, or null. */
export function findSection(text: string, title: string): ChangelogSection | null {
  return parseSections(text).find((s) => s.title === title) ?? null;
}

export interface FreezeResult {
  text: string;
  /** The version heading that was written. */
  version: string;
  /** True when an [Unreleased] section existed and was frozen. */
  frozeUnreleased: boolean;
  /** True when an "### Added"-style subsection was created because Unreleased had no content. */
  createdSkeleton: boolean;
}

const SKELETON = [
  "### Added",
  "- First release of this changelog.",
];

/**
 * Freeze [Unreleased] as [version] - <date>. Creates the section when the
 * changelog has none yet (first release). Date is caller-supplied (tests
 * pass a fixed one); format YYYY-MM-DD.
 */
export function freezeUnreleased(text: string, version: string, date: string): FreezeResult {
  const sections = parseSections(text);
  const unreleasedList = sections.filter((s) => s.title === "Unreleased");
  if (unreleasedList.length > 1) {
    // Freezing used to rewrite only the first one and leave the second
    // [Unreleased] on disk - a corrupted changelog that gates then reject.
    throw new Error(
      "CHANGELOG.md has " + unreleasedList.length + " [Unreleased] sections; merge them first",
    );
  }
  const unreleased = unreleasedList[0] ?? null;
  const heading = "## [" + version + "] - " + date;

  // Refuse a freeze that would produce two "## [version]" headings: freezing
  // twice (or re-freezing an already-released version) used to duplicate the
  // section with exit 0 and silently corrupt the release notes source.
  if (sections.some((s) => s.title === version)) {
    throw new Error(
      "CHANGELOG.md already has a [" + version + "] section; bump the version before freezing again",
    );
  }

  if (!unreleased) {
    // First release: insert right after the header block, before the first
    // existing section or at the end. Fence-aware: a heading inside a fenced
    // example block is documentation, not document structure, so the scan
    // skips everything between ``` / ~~~ markers (same rule as parseSections).
    const lines = text.split(/\r?\n/);
    const fence = new FenceTracker();
    let insertAt = -1;
    for (let i = 0; i < lines.length; i++) {
      const inside = fence.insideFence();
      fence.next(lines[i]!);
      if (!inside && HEADING_RE.test(lines[i]!)) {
        insertAt = i;
        break;
      }
    }
    if (insertAt < 0) insertAt = lines.length;
    const block = [heading, ...SKELETON, ""];
    lines.splice(insertAt, 0, ...block);
    return { text: lines.join("\n"), version, frozeUnreleased: false, createdSkeleton: true };
  }

  const body = unreleased.body.length > 0 ? [...unreleased.body] : [...SKELETON];
  const createdSkeleton = unreleased.body.length === 0;
  const lines = text.split(/\r?\n/);
  // Replace the heading line.
  lines[unreleased.line - 1] = heading;
  // Splice the body back in place of the old body.
  const afterHeading = unreleased.line; // 0-based index of the first body line
  const oldBodyLen = unreleased.body.length;
  lines.splice(afterHeading, oldBodyLen, ...body);
  return { text: lines.join("\n"), version, frozeUnreleased: true, createdSkeleton };
}

/** Parse the link block into entries. */
export function parseLinkBlock(text: string): { title: string; url: string }[] {
  const out: { title: string; url: string }[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = LINK_RE.exec(line);
    if (m && m[1] && m[2]) out.push({ title: m[1], url: m[2] });
  }
  return out;
}

/**
 * Ensure the link block holds "[Unreleased]: compare/next...HEAD" and, when a
 * previous version exists, "[version]: compare/vPrev...vVersion". Idempotent:
 * entries this call owns are replaced in place, unrelated ones are preserved.
 * prevVersion is the tag BEFORE this release; null (first release) omits the
 * version entry because there is nothing to compare against.
 */
export function upsertLinks(text: string, repoUrl: string, version: string, prevVersion: string | null): string {
  const base = repoUrl.replace(/\/+$/, "");
  const want = [{ title: "Unreleased", url: base + "/compare/v" + version + "...HEAD" }];
  if (prevVersion !== null) {
    want.push({ title: version, url: base + "/compare/v" + prevVersion + "...v" + version });
  }
  const lines = text.split(/\r?\n/);
  const kept: string[] = [];
  const body: string[] = [];
  let firstKeptAt = -1;
  // Fence-aware: a link definition inside a fenced example block is content,
  // not a link entry, so it is passed through untouched.
  const fence = new FenceTracker();
  for (const line of lines) {
    const inside = fence.insideFence();
    fence.next(line);
    if (inside) {
      body.push(line);
      continue;
    }
    const m = LINK_RE.exec(line);
    if (m && m[1]) {
      if (!want.some((w) => w.title === m![1])) {
        // An unrelated link entry (an older version, say): keep it, in order.
        if (firstKeptAt < 0) firstKeptAt = body.length;
        kept.push(line);
      }
      continue;
    }
    body.push(line);
  }
  const rendered = want.map((w) => "[" + w.title + "]: " + w.url);
  const block = [...rendered, ...kept];
  if (firstKeptAt >= 0) {
    body.splice(firstKeptAt, 0, ...block);
  } else {
    // No link block yet: append after the sections, separated by a blank line.
    while (body.length > 0 && body[body.length - 1] === "") body.pop();
    body.push("", ...block);
  }
  return body.join("\n");
}