# AGENTS.md

Guidance for AI coding agents working on SauceControl.

## Before you code

1. Read `.cursor/rules/architecture.mdc` (always applies).
2. For file-specific work, check `.cursor/rules/frontend.mdc` or `server.mdc`.
3. For deeper context, see `docs/` (start at `docs/README.md`).

## Quick facts

- **Stack**: Nuxt 4 SPA + Nitro on **Bun** (not Node).
- **Dev**: `bun run dev` → opens UI + API; terminal WS on port `3009`.
- **AppImage**: `bun run build:appimage` → `release/SauceControl-x86_64.AppImage` (Linux standalone).
- **Components**: one Nuxt component per UI concern in `app/components/`.
- **Git**: CLI only via `server/utils/git.ts` — no NUL bytes in exec args.
- **Terminal**: separate process `server/terminal-server.ts` — never inline `Bun.serve` WS in Nitro.
- **DB**: `~/.sauce-ctrl/sauce-ctrl.sqlite` via `server/utils/db.ts`.

## Do not

- Add `node-pty` or run terminal WebSocket inside Nitro HTTP.
- Use sql.js in the browser for persistence.
- Expand scope beyond the requested change.

## Project map

`docs/project-map.md` — file index and API reference.
