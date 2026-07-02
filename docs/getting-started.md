# Getting started

## Requirements

| Tool | Version | Why |
|------|---------|-----|
| [Bun](https://bun.sh) | ≥ 1.2 | Runtime, package manager, `bun:sqlite`, `bun:ffi` |
| `git` | any recent | All repository operations |
| `gh` | optional | GitHub auth/setup (installable from in-app modal) |
| Linux | `libutil`, `setsid` | PTY allocation and job control |

> **Important:** SauceControl must run under the **Bun runtime**, not Node. Plain `nuxt dev` under Node will fail on `bun:sqlite` / `bun:ffi`.

## Install

```bash
git clone <your-repo-url>
cd sauce-ctrl
bun install
cp .env.example .env   # optional — defaults work for local dev
```

## Run (development)

```bash
bun run dev
```

This runs `bun --bun nuxt dev`. Open the URL printed in the terminal (often `http://localhost:3000` or `http://localhost:3001` if 3000 is taken).

A **terminal WebSocket server** starts automatically on port `3009` (see `SAUCE_WS_PORT`).

### If another Nuxt dev is stuck

```bash
NUXT_IGNORE_LOCK=1 bun run dev
```

## Run (production preview)

```bash
bun run build
bun run preview
```

Ensure the terminal child process can start (Bun available, port `3009` free).

## Run as a standalone app (AppImage)

If you'd rather **run SauceControl like any other desktop app** — without keeping a dev server open — you can build an **AppImage**. It's a single file that bundles the app and the Bun runtime, so you can double-click it or add it to your launcher. No install wizard required.

From the project root:

```bash
bun run build:appimage
```

When the build finishes, you get the AppImage in two spots:

- `release/SauceControl-x86_64.AppImage` — the freshly built file in the project.
- Your **Downloads** folder — the build automatically copies it there and marks it executable, so it's ready to double-click or run immediately.

```bash
# run the copy that's already set up for you
~/Downloads/SauceControl-x86_64.AppImage

# or run it from the project (make it executable first)
chmod +x release/SauceControl-x86_64.AppImage
./release/SauceControl-x86_64.AppImage
```

> The Downloads location follows your system's configured folder name (via `xdg-user-dir`), falling back to `~/Downloads`.

**What happens when you launch it** (`scripts/appimage/launcher.ts`):

1. Finds free ports for the HTTP API and the terminal WebSocket server.
2. Starts the server using the bundled Bun runtime.
3. Opens the UI in its own app window (Chromium-style `--app` mode when available), or your default browser. Closing the window quits SauceControl.

**Good to know:**

- **`git` is still required** on the machine where you run the AppImage (`gh` too, if you use GitHub features). Those tools aren't bundled inside the image.
- **Your data stays in** `~/.sauce-ctrl/` — same as when you run from source.
- **Bun is bundled** from whatever `bun` binary is on your `PATH` at build time.
- **First build needs network** — `appimagetool` is downloaded once into `release/.tools/`.
- **No FUSE?** Run with `./release/SauceControl-x86_64.AppImage --appimage-extract-and-run`.

## First use

1. Open the app in your browser.
2. Click **＋** in the sidebar → paste an **absolute path** to a local git repo.
3. Explore commit history, stage changes, commit from the right panel.
4. **Terminal** (header) opens a shell at the repo root.
5. **GitHub Setup** (sidebar) runs `gh auth login` in an embedded terminal.

## Environment

Copy `.env.example` to `.env` and adjust as needed. Only `SAUCE_WS_PORT` is SauceControl-specific today; other vars are standard Nuxt/Bun tooling.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `bun:sqlite` / `bun:ffi` protocol error | Run with `bun --bun` (`bun run dev`) |
| Terminal won't connect | Check port `3009` is free; see `pgrep -af terminal-server` |
| Orphan terminal on `3009` after crash | `kill` the `terminal-server.ts` process, restart dev |
| Git command fails | Repo path must exist and be inside a git work tree |
