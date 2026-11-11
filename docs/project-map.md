# Project map

File-by-file index. Update this when adding major modules.

## Root

| File | Purpose |
|------|---------|
| `nuxt.config.ts` | Nuxt 4 config, `ssr: false`, `runtimeConfig.public.wsPort` |
| `package.json` | Scripts (`dev` uses `bun --bun`), dependencies |
| `tailwind.config.ts` | `ink-*` / `accent` color tokens |
| `.env.example` | Documented environment variables |
| `AGENTS.md` | AI agent entry point → links here |

## `app/`

| Path | Purpose |
|------|---------|
| `app.vue` | Root layout (sidebar · tabs · history · details, resizable); loads projects; watches active tab |
| `assets/css/main.css` | Tailwind layers, scrollbar, `.btn` / `.input` |
| `components/Sidebar.vue` | Project list with filter, add / hide (confirmed), GitHub setup entry |
| `components/TabBar.vue` | One tab per open repo (WAI-ARIA tabs; ←/→/Home/End, Delete closes) |
| `components/NoRepoOpen.vue` | Shown when repos exist but every tab is closed |
| `components/ResizeHandle.vue` | Drag/keyboard handle for the sidebar and details panel widths |
| `components/AppDialog.vue` | In-app alert/confirm/prompt (native ones are no-ops in Tauri's WKWebView) |
| `components/AppHeader.vue` | Repo name, branch dropdown, refresh, terminal toggle |
| `components/CommitGraph.vue` | History list + SVG graph gutter |
| `components/DetailPanel.vue` | Routes to StagingArea or CommitDetail |
| `components/StagingArea.vue` | Stage/unstage files, commit message |
| `components/CommitDetail.vue` | Selected commit metadata + file stats |
| `components/TerminalPanel.vue` | Bottom terminal chrome |
| `components/XTerm.vue` | xterm.js + WebSocket client (reusable) |
| `components/GhSetup.vue` | GitHub CLI install/auth modal |
| `components/EmptyState.vue` | No project selected welcome |
| `components/RepoDiscoveryModal.vue` | Scan the computer (or a folder) for repos; choose which appear in the sidebar |
| `components/SettingsModal.vue` | Theme, repository discovery summary, desktop app install |
| `stores/projects.ts` | Project list CRUD + open tabs (`openIds`, active `selectedId`, persisted) |
| `stores/repo.ts` | Git state, staging, commit, checkout |
| `stores/ui.ts` | Terminal + modal visibility, persisted panel widths |
| `stores/dialog.ts` | Queue behind `appAlert` / `appConfirm` / `appPrompt` |
| `stores/theme.ts` | Theme list (4 dark, 2 light); colours live in `assets/css/main.css` |
| `composables/useDialog.ts` | `appAlert`, `appConfirm`, `appPrompt`, `alertError` |
| `stores/repoScan.ts` | Repository discovery scan status (polls the server) |
| `utils/graph.ts` | `computeGraph()`, lane colors |

## `server/`

| Path | Purpose |
|------|---------|
| `api/projects/index.get.ts` | List projects (enriched with branch) |
| `api/projects/index.post.ts` | Add project by path |
| `api/projects/bulk.post.ts` | Add many projects at once |
| `api/projects/[id].delete.ts` | Remove project |
| `api/projects/[id].patch.ts` | Pin / unpin project (`{ pinned }`) |
| `api/system/scan-repos.{get,post,delete}.ts` | Repository discovery: status / start / stop |
| `api/git/status.get.ts` | Working tree status |
| `api/git/log.get.ts` | Commit history (graph data) |
| `api/git/branches.get.ts` | Local + remote branches |
| `api/git/commit.get.ts` | Single commit detail |
| `api/git/diff.get.ts` | File diff (staged or unstaged) |
| `api/git/stage.post.ts` | Stage files or all |
| `api/git/unstage.post.ts` | Unstage files or all |
| `api/git/commit.post.ts` | Create commit |
| `api/git/checkout.post.ts` | Switch branch |
| `api/gh/status.get.ts` | `gh` installed + authenticated |
| `utils/git.ts` | Git CLI wrapper + parsers |
| `utils/gh.ts` | GitHub CLI helpers |
| `utils/db.ts` | SQLite access |
| `utils/projects.ts` | `registerProject()` — validate + save a repo path |
| `utils/repoScan.ts` | Background `.git` discovery (common folders → home → other drives) |
| `utils/pty.ts` | Pseudo-terminal (FFI `openpty` on Linux, `Bun.spawn` terminal on macOS) |
| `plugins/terminal-ws.ts` | Supervise terminal child process |
| `terminal-server.ts` | WebSocket + PTY server (standalone Bun) |

## `scripts/`

| Path | Purpose |
|------|---------|
| `build-appimage.sh` | Bundle Bun + `.output` + terminal sources into a Linux AppImage (`bun run build:appimage`) |
| `appimage/launcher.ts` | AppImage entry: pick free ports, start server, open app window |
| `appimage/AppRun` | AppImage boot shim → runs the launcher under bundled Bun |
| `appimage/sauce-ctrl.desktop` | Desktop entry metadata for the AppImage |
| `build-dmg.sh` | Bundle Bun + `.output` into a macOS `.app`/`.dmg` with a Chromium `--app` launcher (`bun run build:dmg`) |
| `macos/` | `.app` entrypoint, `launcher.ts`, `Info.plist` for `build-dmg.sh` |
| `tauri/prepare.sh` | Stage Bun sidecar + Nitro build + terminal sources into `src-tauri/` (run by `tauri:dev` / `tauri:build`) |

## `src-tauri/` (macOS desktop shell)

| Path | Role |
|------|------|
| `src/main.rs` | Host: ports, PATH, spawn/stop Bun backend, native window |
| `tauri.conf.json` | Bundle config (`externalBin` Bun sidecar, `resources/app`, ad-hoc signing) |
| `Entitlements.plist` | JIT entitlements Bun needs if hardened runtime/notarization is enabled |
| `binaries/`, `resources/` | Generated by `prepare.sh` (git-ignored) |

## Generated / ignored

| Path | Notes |
|------|-------|
| `.nuxt/`, `.output/` | Build artifacts — do not edit |
| `release/` | AppImage output (`SauceCtrl-x86_64.AppImage`) + cached `appimagetool` |
| `node_modules/` | Dependencies |
| `~/.sauce-ctrl/` | Runtime SQLite (user machine) |

## API quick reference

```
GET  /api/projects
POST /api/projects          { path }
POST /api/projects/bulk     { paths }
PATCH  /api/projects/:id      { pinned }
DELETE /api/projects/:id

GET  /api/git/status?path=
GET  /api/git/log?path=&limit=
GET  /api/git/branches?path=
GET  /api/git/commit?path=&hash=
GET  /api/git/diff?path=&file=&staged=
POST /api/git/stage         { path, files? | all? }
POST /api/git/unstage       { path, files? | all? }
POST /api/git/commit        { path, message }
POST /api/git/checkout      { path, branch }

GET  /api/gh/status

GET    /api/system/scan-repos            scan progress + found repos
POST   /api/system/scan-repos { roots? } start (whole computer, or only roots)
DELETE /api/system/scan-repos            stop

WS   ws://host:3009         terminal protocol (see XTerm.vue)
```
