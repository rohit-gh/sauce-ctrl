# Building the macOS DMG

How to build a fresh `SauceCtrl.dmg` from the latest source and install it on a Mac.

There are two ways to build. **Use the Tauri build** unless you can't install Rust.

| | Tauri app (recommended) | Launcher app (no Rust) |
|---|---|---|
| Command | `bun run tauri:build` | `bun run build:dmg` |
| Window | Native window | Opens Chrome/Edge/Brave in `--app` mode, or your default browser |
| Output | `src-tauri/target/release/bundle/dmg/SauceCtrl_<version>_<arch>.dmg` | `release/SauceCtrl-<arch>.dmg` (also copied to `~/Downloads`) |
| Needs | Bun, Rust, Xcode Command Line Tools | Bun, Xcode Command Line Tools |

Both builds include the Bun runtime and the app server, so the target Mac doesn't need Bun or Node. It still needs `git` (and `gh` if you want the GitHub features).

---

## 1. One-time setup

```bash
# Xcode Command Line Tools (provides git, codesign, hdiutil)
xcode-select --install

# Bun ≥ 1.3.5
curl -fsSL https://bun.sh/install | bash

# Rust (Tauri build only)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Check them:

```bash
bun --version     # 1.3.5 or newer
rustc --version   # any stable version
git --version
```

> The Bun binary on your PATH is copied into the app. Whatever version you build with is the version the app runs.

## 2. Get the latest code

```bash
cd path/to/sauce-ctrl
git checkout main          # or the branch you want to ship
git pull
bun install                # pick up any dependency changes
```

### (Optional) Bump the version

The version appears in the DMG filename and in Finder's "Get Info". Update it in **both** files so they match:

- `package.json` → `"version"`
- `src-tauri/tauri.conf.json` → `"version"`

## 3. Build

### Tauri app (recommended)

```bash
bun run tauri:build
```

This does the following:

1. `scripts/tauri/prepare.sh` runs `nuxt build`. It then copies the Bun binary into `src-tauri/binaries/` and the server output into `src-tauri/resources/app/`.
2. `tauri build` compiles the Rust host, bundles the `.app`, ad-hoc signs it and wraps it in a DMG.

The first build compiles all Rust dependencies and takes several minutes. Later builds are much faster.

Output (Apple Silicon example):

```
src-tauri/target/release/bundle/macos/SauceCtrl.app
src-tauri/target/release/bundle/dmg/SauceCtrl_0.1.0_aarch64.dmg
```

### Launcher app (no Rust)

```bash
bun run build:dmg
```

Output: `release/SauceCtrl-<arch>.dmg`, with a copy in `~/Downloads`.

### Architecture

The DMG only runs on the same CPU type as the Mac that built it. Build on an Apple Silicon Mac for Apple Silicon (`aarch64` / `arm64`), and on an Intel Mac for Intel (`x86_64`).

## 4. Install

1. Double-click the `.dmg`.
2. Drag **SauceCtrl** onto the **Applications** shortcut. If an older copy is already there, choose **Replace**.
3. Eject the DMG.
4. Open SauceCtrl from Applications or Launchpad.

**Upgrading:** quit SauceCtrl first (⌘Q), then replace the app as above. Your projects and settings are stored in `~/.sauce-ctrl/` and are kept.

### First launch on another Mac

The build is ad-hoc signed and **not notarized**. If you copy it to a different Mac, Gatekeeper blocks it the first time. To allow it, do one of the following:

- Right-click (or Control-click) **SauceCtrl.app** → **Open** → **Open**, or
- Open **System Settings → Privacy & Security** and click **Open Anyway**, or
- Run `xattr -dr com.apple.quarantine /Applications/SauceCtrl.app` in Terminal.

On the Mac that built the DMG this usually isn't needed.

Install the app in `/Applications`. If it runs from `~/Documents`, `~/Desktop` or `~/Downloads`, macOS asks for folder access on launch and the app waits until you answer.

If `git` is missing, the Tauri app offers to install Apple's Command Line Tools on launch.

## 5. Check the build

Before you share a DMG, test the installed app itself (passing `nuxt build` isn't enough):

- Open a repository, stage a file and commit.
- Open the terminal panel and run a command.
- Try something that shows a confirmation dialog, such as discarding changes. Make sure the dialog appears.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `bun` fails inside the repo with `CouldntReadCurrentDirectory`, or env vars are ignored | macOS is blocking your terminal/editor from reading `~/Documents`. Allow it in **System Settings → Privacy & Security → Files and Folders → Documents**. Alternatively, copy the repo outside `~/Documents` and build there. |
| `could not determine Rust target triple` | Rust isn't installed or isn't on your PATH. Install it with `rustup`, then open a new terminal. |
| `bun not found on PATH` | Install Bun, or run `source ~/.zshrc` in a new shell. |
| `failed to bundle project` / `bundle_dmg.sh` error | Eject any mounted **SauceCtrl** volume in Finder, then build again. |
| App opens but the window stays blank, or it quits on launch | Check the server log at `~/Library/Logs/SauceCtrl/server.log`. |
| "SauceCtrl is damaged and can't be opened" | It's the quarantine flag. Run the `xattr` command above. |
| GitHub features can't find `gh` | Install it with `brew install gh`. The app reads your login shell's PATH, so Homebrew installs are found. |

## Signing and notarizing (optional)

To distribute the DMG without the Gatekeeper warning, you need an Apple Developer ID:

1. In `src-tauri/tauri.conf.json`, set `bundle.macOS.signingIdentity` to your "Developer ID Application: …" identity (replacing `"-"`).
2. Export `APPLE_ID`, `APPLE_PASSWORD` (an app-specific password) and `APPLE_TEAM_ID` before you run `bun run tauri:build`. Tauri then notarizes the build.

See the [Tauri macOS signing guide](https://v2.tauri.app/distribute/sign/macos/) for details.

## Related

- [Getting started](./getting-started.md#run-as-a-standalone-app-macos): the short version
- `scripts/tauri/prepare.sh`: what goes into the Tauri bundle
- `scripts/build-dmg.sh`: the no-Rust launcher build
- `src-tauri/src/main.rs`: how the app starts the bundled server
