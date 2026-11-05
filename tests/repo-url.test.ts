import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { systemGit, type GitRunner } from "../src/git.js";
import { deriveRepoUrl } from "../src/cli.js";

const fakeGit = (url: string): GitRunner =>
  url === ""
    ? () => { throw new Error("no remote"); }
    : (args: string[]) => {
        if (args[0] === "remote" && args[1] === "get-url") return url;
        throw new Error("unexpected args");
      };

describe("deriveRepoUrl", () => {
  it("normalizes https origin URLs", () => {
    expect(deriveRepoUrl("x", fakeGit("https://github.com/acme/widgets.git"))).toBe("https://github.com/acme/widgets");
    expect(deriveRepoUrl("x", fakeGit("https://github.com/acme/widgets"))).toBe("https://github.com/acme/widgets");
  });

  it("normalizes ssh origin URLs", () => {
    expect(deriveRepoUrl("x", fakeGit("git@github.com:acme/widgets.git"))).toBe("https://github.com/acme/widgets");
  });

  it("falls back to the releaseforge default without an origin remote", () => {
    expect(deriveRepoUrl("x", fakeGit(""))).toBe("https://github.com/kesheC/releaseforge");
  });

  it("reads a real temporary repository with an origin remote", () => {
    const root = mkdtempSync(join(tmpdir(), "rf-origin-"));
    try {
      const git = systemGit(root);
      git(["init", "-b", "main"]);
      git(["remote", "add", "origin", "https://github.com/acme/realrepo.git"]);
      expect(deriveRepoUrl(root, git)).toBe("https://github.com/acme/realrepo");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("strips credential userinfo from https origins (CI checkout shape)", () => {
    expect(deriveRepoUrl("x", fakeGit("https://ghp_abc123@github.com/acme/widgets.git"))).toBe("https://github.com/acme/widgets");
    expect(deriveRepoUrl("x", fakeGit("https://x-access-token:ghp_full@github.com/acme/widgets.git"))).toBe("https://github.com/acme/widgets");
    expect(deriveRepoUrl("x", fakeGit("https://user:pass@github.com/acme/widgets"))).toBe("https://github.com/acme/widgets");
  });

  it("warns when origin exists but is not a GitHub URL", () => {
    const warnings: string[] = [];
    const url = deriveRepoUrl("x", fakeGit("git@gitlab.com:acme/widgets.git"), (msg) => { warnings.push(msg); });
    expect(url).toBe("https://github.com/kesheC/releaseforge");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("gitlab.com");
    expect(warnings[0]).toContain("not a GitHub URL");
  });

  it("does not warn for a missing origin (documented fallback)", () => {
    const warnings: string[] = [];
    deriveRepoUrl("x", fakeGit(""), (msg) => { warnings.push(msg); });
    expect(warnings).toHaveLength(0);
  });

  it("the non-GitHub warn never echoes credential userinfo", () => {
    // H1: the warn used to print the raw origin URL; a credential-prefixed
    // origin (https://user:ghp_x@gitlab.example.com/...) leaked the token
    // to stderr, where CI logs and pasted issues live.
    const warnings: string[] = [];
    const url = deriveRepoUrl("x", fakeGit("https://user:ghp_SUPERSECRET123@gitlab.example.com/acme/widgets.git"), (msg) => { warnings.push(msg); });
    expect(url).toBe("https://github.com/kesheC/releaseforge");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("gitlab.example.com/acme/widgets.git");
    expect(warnings[0]).not.toContain("ghp_SUPERSECRET123");
    expect(warnings[0]).not.toContain("user:");
  });
});