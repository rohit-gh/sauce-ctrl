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
| `app.vue` | Root layout; loads projects; watches selected repo |
| `assets/css/main.css` | Tailwind layers, scrollbar, `.btn` / `.input` |
| `components/Sidebar.vue` | Project list, add/remove, GitHub setup entry |
| `components/AppHeader.vue` | Repo name, branch dropdown, refresh, terminal toggle |
| `components/CommitGraph.vue` | History list + SVG graph gutter |
| `components/DetailPanel.vue` | Routes to StagingArea or CommitDetail |
| `components/StagingArea.vue` | Stage/unstage files, commit message |
| `components/CommitDetail.vue` | Selected commit metadata + file stats |
| `components/TerminalPanel.vue` | Bottom terminal chrome |
| `components/XTerm.vue` | xterm.js + WebSocket client (reusable) |
| `components/GhSetup.vue` | GitHub CLI install/auth modal |
| `components/EmptyState.vue` | No project selected welcome |
| `stores/projects.ts` | Project list CRUD |
| `stores/repo.ts` | Git state, staging, commit, checkout |
| `stores/ui.ts` | Terminal + modal visibility |
| `utils/graph.ts` | `computeGraph()`, lane colors |

## `server/`

| Path | Purpose |
|------|---------|
| `api/projects/index.get.ts` | List projects (enriched with branch) |
| `api/projects/index.post.ts` | Add project by path |
| `api/projects/[id].delete.ts` | Remove project |
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
| `utils/pty.ts` | FFI pseudo-terminal |
| `plugins/terminal-ws.ts` | Supervise terminal child process |
| `terminal-server.ts` | WebSocket + PTY server (standalone Bun) |

## `scripts/`

| Path | Purpose |
|------|---------|
| `build-appimage.sh` | Bundle Bun + `.output` + terminal sources into a Linux AppImage (`bun run build:appimage`) |
| `appimage/launcher.ts` | AppImage entry: pick free ports, start server, open app window |
| `appimage/AppRun` | AppImage boot shim → runs the launcher under bundled Bun |
| `appimage/sauce-ctrl.desktop` | Desktop entry metadata for the AppImage |

## Generated / ignored

| Path | Notes |
|------|-------|
| `.nuxt/`, `.output/` | Build artifacts — do not edit |
| `release/` | AppImage output (`SauceControl-x86_64.AppImage`) + cached `appimagetool` |
| `node_modules/` | Dependencies |
| `~/.sauce-ctrl/` | Runtime SQLite (user machine) |

## API quick reference

```
GET  /api/projects
POST /api/projects          { path }
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

WS   ws://host:3009         terminal protocol (see XTerm.vue)
```
