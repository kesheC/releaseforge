import { execFileSync } from "node:child_process";
import { platform } from "node:os";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * npm pack integration: run it, find the tarball, hash it. The CLI never
 * publishes to the registry itself - publishing means attaching the tarball
 * to a GitHub Release, which the release command does.
 */

export interface PackResult {
  /** Absolute path to the generated tarball. */
  tarballPath: string;
  /** Base name, e.g. releaseforge-0.2.0.tgz */
  tarball: string;
  /** Size in bytes. */
  bytes: number;
  /** sha256 hex digest. */
  sha256: string;
}

/** Run npm pack --pack-destination <dest> and return the tarball info. */
export function runPack(root: string, dest: string): PackResult {
  // Windows spawns npm through npm.cmd, which execFileSync cannot launch
  // without a shell - and with a shell the argv is re-joined with spaces,
  // so a dest containing spaces must be quoted here or npm packs into the
  // first space-free token (or fails outright). JSON.stringify wraps the
  // path in double quotes and escapes embedded ones, which is exactly the
  // quoting the re-join needs; cmd metacharacters stay literal inside
  // double quotes. The whole command is passed as ONE argument (DEP0190:
  // execFileSync + args array + shell:true is deprecated on Node >= 22.14);
  // with no args array the string IS the command line. POSIX keeps argv
  // intact and stays unquoted.
  const shelled = platform() === "win32";
  const out = shelled
    ? execFileSync("npm pack --pack-destination " + JSON.stringify(dest), {
        cwd: root,
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
        shell: true,
        // npm notice lines go to stderr but pollute merged streams; a CLI whose
        // stdout is a transcript should not emit decoration around the answer.
        env: { ...process.env, npm_config_loglevel: "error" },
      })
    : execFileSync("npm", ["pack", "--pack-destination", dest], {
        cwd: root,
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
        // npm notice lines go to stderr but pollute merged streams; a CLI whose
        // stdout is a transcript should not emit decoration around the answer.
        env: { ...process.env, npm_config_loglevel: "error" },
      });
  // npm prints the tarball file name on the last non-empty line.
  const lines = out.split(/\r?\n/).filter((l) => l.trim() !== "");
  const name = lines[lines.length - 1]!.trim();
  const tarballPath = join(dest, name);
  const bytes = statSync(tarballPath).size;
  const sha256 = createHash("sha256").update(readFileSync(tarballPath)).digest("hex");
  return { tarballPath, tarball: name, bytes, sha256 };
}
