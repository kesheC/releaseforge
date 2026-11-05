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
});
