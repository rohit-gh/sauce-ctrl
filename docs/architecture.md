# Architecture

## Overview

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (Vue SPA, ssr: false)                              │
│  ┌──────────┐ ┌────────────┐ ┌─────────────┐ ┌───────────┐ │
│  │ Sidebar  │ │ Header     │ │ CommitGraph │ │ Detail    │ │
│  │ projects │ │ branches   │ │ SVG lanes   │ │ staging / │ │
│  └────┬─────┘ └─────┬──────┘ └──────┬──────┘ │ commit    │ │
│       │             │               │        └─────┬─────┘ │
│       └─────────────┴───────────────┴──────────────┘       │
│                         │ $fetch /api/*                     │
│  ┌──────────────────────┴────────────────────────────────┐ │
│  │ XTerm.vue  ──WebSocket──►  :3009 (terminal-server)    │ │
│  └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  Nitro (Bun) — HTTP API                                     │
│  server/api/*  →  server/utils/{git,gh,db}.ts               │
│  server/plugins/terminal-ws.ts  →  spawns terminal-server   │
└─────────────────────────────────────────────────────────────┘
          │                    │                    │
          ▼                    ▼                    ▼
      git CLI               gh CLI          ~/.sauce-ctrl/
```

## Frontend layers

| Layer | Location | Responsibility |
|-------|----------|----------------|
| Layout shell | `app/app.vue` | Sidebar + header + main + terminal + modals |
| Components | `app/components/` | All UI pieces (one file per concern) |
| Stores | `app/stores/` | Pinia: `projects`, `repo`, `ui` |
| Graph math | `app/utils/graph.ts` | Lane assignment for commit DAG |
| Styles | `app/assets/css/main.css`, `tailwind.config.ts` | Theme tokens |

## Backend layers

| Layer | Location | Responsibility |
|-------|----------|----------------|
| HTTP routes | `server/api/` | REST handlers (thin) |
| Git | `server/utils/git.ts` | `runGit`, log, status, branches, commit detail, diff |
| GitHub | `server/utils/gh.ts` | `gh` install/auth probe, token persist |
| DB | `server/utils/db.ts` | SQLite projects/settings/cache |
| PTY | `server/utils/pty.ts` | FFI `openpty`, read/write master, resize |
| Terminal WS | `server/terminal-server.ts` | Standalone `Bun.serve` + WebSocket |
| Supervisor | `server/plugins/terminal-ws.ts` | Spawn/kill terminal child |

## Why terminal is a separate process

`Bun.serve` WebSocket inside Nitro's node-compat HTTP process does not accept connections reliably (accept queue stalls). The fix: a dedicated pure-Bun child running `terminal-server.ts` on `SAUCE_WS_PORT`.

## Why not node-pty

`node-pty` reads the PTY master fd in a way incompatible with Bun (`ESPIPE`). We use `libutil.openpty` via `bun:ffi` instead.

## Git output parsing

- **Arguments** to `git`: field separator `\u001f` (unit separator), record `\u001e`.
- **Stdout** from `git status -z`: NUL `\u0000` between records (parse only, never in args).

## Commit graph algorithm

`computeGraph()` in `app/utils/graph.ts`:

1. Commits processed newest-first.
2. Each commit assigned a lane (column); first parent continues the lane.
3. Merge parents spawn/claim additional lanes.
4. SVG edges connect commit → each parent within the loaded window.

## Persistence schema

```sql
projects (id, name, path, added_at, last_opened)
settings (key, value)          -- app preferences (no credentials stored here)
cache    (key, value, expires_at)
```

## Planned / not yet built

- Syntax-highlighted diff viewer (API exists: `GET /api/git/diff`)
- Push/pull/fetch UI
- Native folder picker (currently paste path)
