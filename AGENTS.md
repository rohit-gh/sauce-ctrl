# AGENTS.md

Guidance for AI coding agents working on SauceCtrl.

## Before you code

1. Read `.cursor/rules/architecture.mdc` (always applies).
2. For file-specific work, check `.cursor/rules/frontend.mdc` or `server.mdc`.
3. For deeper context, see `docs/` (start at `docs/README.md`).

## Quick facts

- **Stack**: Nuxt 4 SPA + Nitro on **Bun** (not Node).
- **Dev**: `bun run dev` → opens UI + API; terminal WS on port `3009`.
- **AppImage**: `bun run build:appimage` → `release/SauceCtrl-x86_64.AppImage` (Linux standalone).
- **macOS (Tauri 2)**: `bun run tauri:build` → `src-tauri/target/release/bundle/{macos,dmg}/`; `bun run tauri:dev` for a native dev window. Needs Rust. The Tauri host only launches the bundled Bun backend — backend logic stays in `server/`.
- **macOS (no Rust)**: `bun run build:dmg` → `release/SauceCtrl-<arch>.dmg` (Chromium `--app` launcher).
- **Components**: one Nuxt component per UI concern in `app/components/`.
- **Git**: CLI only via `server/utils/git.ts` — no NUL bytes in exec args.
- **Terminal**: separate process `server/terminal-server.ts` — never inline `Bun.serve` WS in Nitro.
- **DB**: `~/.sauce-ctrl/sauce-ctrl.sqlite` via `server/utils/db.ts`.

## Do not

- Add `node-pty` or run terminal WebSocket inside Nitro HTTP.
- Use sql.js in the browser for persistence.
- Expand scope beyond the requested change.
- Use `window.alert` / `confirm` / `prompt` — they are silent no-ops in the macOS (Tauri/WKWebView) app. Use `appAlert` / `appConfirm` / `appPrompt` / `alertError` from `app/composables/useDialog.ts`.

## Project map

`docs/project-map.md` — file index and API reference.
