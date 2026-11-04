# releaseforge

"Automate the npm release chain: plan, gates, changelog freeze, tag, pack."

**releaseforge** turns a conventional-commit history into a release: it reads the commits since your last tag, decides the semver bump, checks five release gates, freezes the changelog, tags, and produces the npm tarball - in one auditable command. It stops deliberately short of git push and of calling the registry: pushing and publishing remain explicit network decisions.

Zero runtime dependencies. Node >= 20.11.

## Why

Hand-driven releases rot in three predictable places: the changelog section nobody freezes, the version that moves in package.json but not in the source constant, and the tag that collides with the one from last month. releaseforge makes each of those a gate that fails loudly instead of a bug that ships quietly.

## Install

Distribution does not use the npm registry: each release attaches the installable tarball to its GitHub Release.

```bash
npm install -g ./releaseforge-<version>.tgz   # from a release asset
```

## Quickstart

All transcripts below are real output, captured by running the exact commands shown. The first block builds a scratch demo repository from scratch; the blocks after it run against that same demo. The commit hash in the plan output is shortened with … because it changes with every fresh repository.

```bash
$ rm -rf /tmp/rfdemo && mkdir -p /tmp/rfdemo && cd /tmp/rfdemo
$ git init -q -b main .
$ git config user.email demo@demo.dev
$ git config user.name demo
$ git config core.autocrlf false
$ printf '{"name":"demo","version":"0.3.0"}\n' > package.json
$ printf '# Changelog\n\n## [Unreleased]\n\n### Added\n- json export flag\n' > CHANGELOG.md
$ printf 'demo\n' > lib.txt
$ git add -A
$ git commit -qm "feat: json export"
$ releaseforge plan
release plan: 0.3.0 -> 0.4.0 (minor)
commits considered: 1

release notes:
- feat: json export (…)
```

`plan` decided minor (a `feat:` commit) and drafted the release notes without writing anything.

### The five gates

```bash
$ cd /tmp/rfdemo
$ releaseforge gates
  ok    clean-tree  work tree has no uncommitted changes
  ok    changelog-section  CHANGELOG.md has an [Unreleased] section to freeze
  ok    package-lock-sync  package-lock.json version matches package.json
  ok    version-constant-sync  declared version constants match package.json
  ok    tag-available  the release tag does not exist yet

5 gates, all pass
```

### Release

```bash
$ cd /tmp/rfdemo
$ releaseforge release
  ok    clean-tree  work tree has no uncommitted changes
  ok    changelog-section  CHANGELOG.md has an [Unreleased] section to freeze
  ok    package-lock-sync  package-lock.json version matches package.json
  ok    version-constant-sync  declared version constants match package.json
  ok    tag-available  the release tag does not exist yet

5 gates, all pass
done: freeze changelog -> commit changelog -> tag release -> npm pack (demo-0.3.0.tgz)
```

What one command did:

1. froze `## [Unreleased]` into `## [0.3.0] - <today>` and rewrote the compare links at the bottom of the changelog
2. committed that as `chore(release): v0.3.0`
3. created the tag `v0.3.0`
4. ran `npm pack` into `release/demo-0.3.0.tgz`

The frozen changelog head, as the run above left it:

```text
# Changelog

## [0.3.0] - 2026-11-04

### Added
- json export flag

[Unreleased]: https://github.com/kesheC/releaseforge/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/kesheC/releaseforge/compare/v0.3.0...v0.3.0
```

### Gates fail loudly

Run release again right after a release and the gates explain exactly what is now wrong:

```bash
$ cd /tmp/rfdemo
$ releaseforge release
  FAIL  clean-tree  work tree has no uncommitted changes - 1 uncommitted change(s): run git status --porcelain
  FAIL  changelog-section  CHANGELOG.md has an [Unreleased] section to freeze - no ## [Unreleased] section to freeze; add one first
  ok    package-lock-sync  package-lock.json version matches package.json
  ok    version-constant-sync  declared version constants match package.json
  FAIL  tag-available  the release tag does not exist yet - tag v0.3.0 already exists; bump the version first

5 gates, 3 failed: clean-tree, changelog-section, tag-available
```

Add `--dry-run` to any command to print the steps without writing anything.

## Commands

| command | effect | exit codes |
| --- | --- | --- |
| `releaseforge plan` | print the bump plan and draft release notes; writes nothing | 0 |
| `releaseforge gates` | run the five gates against the working tree | 0 pass, 1 any gate failed |
| `releaseforge freeze` | freeze `[Unreleased]`, rewrite compare links | 0, 2 no changelog |
| `releaseforge release` | gates, then freeze, commit, tag, pack | 0, 1 gate failed, 2 usage |

Streams: results and plans print to stdout; usage and command errors print to stderr. The exit code is the contract - CI scripts can rely on `releaseforge gates` failing without parsing output.

## The five gates, in words

1. **clean-tree** - no uncommitted changes. A release built from a dirty tree is not reproducible.
2. **changelog-section** - an `## [Unreleased]` section exists to freeze. Releases get their notes from this section.
3. **package-lock-sync** - `package-lock.json` declares the same version as `package.json`. A missing lockfile passes; a drifting one fails.
4. **version-constant-sync** - every `const VERSION = "X.Y.Z"`-style constant under `src/` matches `package.json`. The scanner skips comment lines so documentation examples never trip it.
5. **tag-available** - `v<version>` is not an existing local tag. Colliding with a shipped tag breaks the GitHub Release workflow before it starts.

## Bump rules

From [Conventional Commits](https://www.conventionalcommits.org/):

- a `BREAKING CHANGE:` footer or a `!` marker -> **major**
- `feat:` -> **minor**
- `fix:` -> **patch**
- anything else (docs, chore, test, refactor...) -> **none** (the version does not move)

`planBump` short-circuits on the first breaking commit. Prerelease versions are not supported on purpose: the chain tags plain X.Y.Z versions only.

## Library use

The CLI is a thin argv parser over the exported functions - everything the commands do is importable:

```js
import { planRelease, runGates, systemGit } from "releaseforge";

const git = systemGit(process.cwd());
const plan = planRelease(process.cwd(), git);   // { from, to, bump, commits }
const gates = runGates(collectGateContext(process.cwd(), git));
```

Every stage is a pure function over typed inputs except the thin git/npm wrappers, so the whole chain is testable without spawning processes.

## CI integration

Gates are designed for CI: exit codes carry the verdict, output is plain text, and `plan` never writes. A typical workflow gates the push:

```yaml
- run: npx releaseforge gates
- run: npx releaseforge release
- run: git push origin main --follow-tags
```

Push the tag and the included release.yml turns it into a GitHub Release with the tarball, a stable-name copy, and a SHA256SUMS.txt.

## Development

```bash
npm ci            # install the dev toolchain
npm run build     # emit dist/
npm test          # 58 tests, offline
npm run coverage  # thresholds: 80 statements / 70 branches / 85 functions / 80 lines
npm run dev       # build, then run dist/cli.js
```

The test suite covers the pure modules, the git workflow on throwaway repositories, and the CLI commands in-process, including a real npm pack.

## Security

See [SECURITY.md](SECURITY.md). Reproducing a bug never needs tokens or secrets.

## License

[MIT](LICENSE)

---

# releaseforge 中文说明

「自动化 npm 发版链：计划、闸门、冻结变更日志、打标签、打包。」

**releaseforge** 把 conventional commit 历史变成一次发版：读取上一个标签以来的提交、判定 semver 升级位、检查五道发版闸门、冻结变更日志、打标签并产出 npm tarball —— 一条命令完成，全程可审计。它刻意止步于 git push 与调用 registry：推送与发布始终是显式的网络决策。

零运行时依赖。Node >= 20.11。

## 为什么做这个

手工发版在三个地方按同样的方式腐烂：没人冻结的 `[Unreleased]` 小节、package.json 动了而源码里的版本常量没动、与上个月撞车的标签。releaseforge 把每一项都变成会大声失败的闸门，而不是悄悄上线的缺陷。

## 安装

分发不走 npm registry：每个版本把可安装的 tarball 附在 GitHub Release 上。

```bash
npm install -g ./releaseforge-<version>.tgz   # 从 Release 资产安装
```

## 快速开始

下文所有转录都是真实输出，来自逐字运行所示命令。第一块从零搭建 scratch demo 仓库；后面的块都跑在同一个 demo 上。plan 输出里的提交哈希用 … 缩略，因为每次新建仓库它都会变。

```bash
$ rm -rf /tmp/rfdemo && mkdir -p /tmp/rfdemo && cd /tmp/rfdemo
$ git init -q -b main .
$ git config user.email demo@demo.dev
$ git config user.name demo
$ git config core.autocrlf false
$ printf '{"name":"demo","version":"0.3.0"}\n' > package.json
$ printf '# Changelog\n\n## [Unreleased]\n\n### Added\n- json export flag\n' > CHANGELOG.md
$ printf 'demo\n' > lib.txt
$ git add -A
$ git commit -qm "feat: json export"
$ releaseforge plan
release plan: 0.3.0 -> 0.4.0 (minor)
commits considered: 1

release notes:
- feat: json export (…)
```

`plan` 判定 minor（有一个 `feat:` 提交）并草拟了发布说明，没有写任何文件。

### 五道闸门

```bash
$ cd /tmp/rfdemo
$ releaseforge gates
  ok    clean-tree  work tree has no uncommitted changes
  ok    changelog-section  CHANGELOG.md has an [Unreleased] section to freeze
  ok    package-lock-sync  package-lock.json version matches package.json
  ok    version-constant-sync  declared version constants match package.json
  ok    tag-available  the release tag does not exist yet

5 gates, all pass
```

### 发版

```bash
$ cd /tmp/rfdemo
$ releaseforge release
  ok    clean-tree  work tree has no uncommitted changes
  ok    changelog-section  CHANGELOG.md has an [Unreleased] section to freeze
  ok    package-lock-sync  package-lock.json version matches package.json
  ok    version-constant-sync  declared version constants match package.json
  ok    tag-available  the release tag does not exist yet

5 gates, all pass
done: freeze changelog -> commit changelog -> tag release -> npm pack (demo-0.3.0.tgz)
```

这一条命令做了什么：

1. 把 `## [Unreleased]` 冻结为 `## [0.3.0] - <当天日期>`，并重写变更日志底部的 compare 链接
2. 以 `chore(release): v0.3.0` 提交这一改动
3. 创建标签 `v0.3.0`
4. 执行 `npm pack`，产出 `release/demo-0.3.0.tgz`

冻结后的变更日志开头，即上面那次运行留下的样子：

```text
# Changelog

## [0.3.0] - 2026-11-04

### Added
- json export flag

[Unreleased]: https://github.com/kesheC/releaseforge/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/kesheC/releaseforge/compare/v0.3.0...v0.3.0
```

### 闸门大声失败

发版之后立刻再跑一次 release，闸门会逐条说明现在哪里不对：

```bash
$ cd /tmp/rfdemo
$ releaseforge release
  FAIL  clean-tree  work tree has no uncommitted changes - 1 uncommitted change(s): run git status --porcelain
  FAIL  changelog-section  CHANGELOG.md has an [Unreleased] section to freeze - no ## [Unreleased] section to freeze; add one first
  ok    package-lock-sync  package-lock.json version matches package.json
  ok    version-constant-sync  declared version constants match package.json
  FAIL  tag-available  the release tag does not exist yet - tag v0.3.0 already exists; bump the version first

5 gates, 3 failed: clean-tree, changelog-section, tag-available
```

任何命令加 `--dry-run` 都只打印步骤、不写任何东西。

## 命令

| 命令 | 作用 | 退出码 |
| --- | --- | --- |
| `releaseforge plan` | 打印升级计划与草拟发布说明；不写任何文件 | 0 |
| `releaseforge gates` | 对工作树跑五道闸门 | 0 通过，1 任一失败 |
| `releaseforge freeze` | 冻结 `[Unreleased]`，重写 compare 链接 | 0，2 无变更日志 |
| `releaseforge release` | 闸门，然后冻结、提交、打标、打包 | 0，1 闸门失败，2 用法错误 |

流约定：结果与计划走 stdout；用法与命令错误走 stderr。退出码就是契约 —— CI 脚本可以只依赖 `releaseforge gates` 的失败，不必解析输出。

## 五道闸门，逐条说明

1. **clean-tree** —— 没有未提交的改动。从脏树构建的发版不可复现。
2. **changelog-section** —— 存在待冻结的 `## [Unreleased]` 小节。发布说明从这里来。
3. **package-lock-sync** —— `package-lock.json` 与 `package.json` 版本一致。缺 lockfile 通过；漂移则失败。
4. **version-constant-sync** —— `src/` 下所有 `const VERSION = "X.Y.Z"` 风格的常量与 package.json 一致。扫描器跳过注释行，文档示例不会误触。
5. **tag-available** —— `v<version>` 不是已存在的本地标签。与已发布标签撞车会在 GitHub Release 流程开始前就被拦下。

## 升级位规则

依据 [Conventional Commits](https://www.conventionalcommits.org/)：

- `BREAKING CHANGE:` 尾注或 `!` 标记 -> **major**
- `feat:` -> **minor**
- `fix:` -> **patch**
- 其余（docs、chore、test、refactor……）-> **none**（版本不动）

`planBump` 遇到第一个 breaking 提交即短路。刻意不支持 prerelease：本链只打纯 X.Y.Z 标签。

## 作为库使用

CLI 只是参数解析的薄壳 —— 命令能做的每件事都可以导入：

```js
import { planRelease, runGates, systemGit } from "releaseforge";

const git = systemGit(process.cwd());
const plan = planRelease(process.cwd(), git);   // { from, to, bump, commits }
const gates = runGates(collectGateContext(process.cwd(), git));
```

除了一层 git/npm 封装，每个环节都是纯函数；整条链不需要起子进程即可测试。

## CI 集成

闸门为 CI 而设计：退出码承载结论、输出是纯文本、`plan` 永不写盘。典型流程在推送前设闸：

```yaml
- run: npx releaseforge gates
- run: npx releaseforge release
- run: git push origin main --follow-tags
```

推送标签后，仓库自带的 release.yml 会把它变成一个 GitHub Release：附带 tarball、稳定名副本和 SHA256SUMS.txt。

## 开发

```bash
npm ci            # 安装开发工具链
npm run build     # 产出 dist/
npm test          # 58 个测试，离线
npm run coverage  # 阈值：80 statements / 70 branches / 85 functions / 80 lines
npm run dev       # build 后运行 dist/cli.js
```

测试覆盖纯函数模块、真实临时仓库上的 git 工作流，以及进程内的 CLI 命令（含一次真实的 npm pack）。

## 安全

见 [SECURITY.md](SECURITY.md)。复现 bug 永远不需要令牌或密钥。

## 许可

[MIT](LICENSE)

