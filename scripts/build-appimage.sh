#!/bin/bash
# Build a self-contained SauceControl AppImage.
#
# Bundles: the Bun runtime, the Nitro build (.output), and the terminal-server
# sources it spawns at runtime. Requires `git` (and optionally `gh`) on the host.
#
# Usage: scripts/build-appimage.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

APP_NAME="SauceControl"
ARCH="${ARCH:-x86_64}"
# Note: `dist` in this repo is a symlink into .output/public, so build here.
DIST="${ROOT}/release"
APPDIR="${DIST}/AppDir"
APP_LIB="${APPDIR}/usr/lib/sauce-ctrl"
TOOLS="${DIST}/.tools"
TEMPLATE="${ROOT}/scripts/appimage"

log() { printf '\033[1;36m[appimage]\033[0m %s\n' "$*"; }

# --- Locate the Bun binary to bundle -----------------------------------------
BUN_BIN="$(command -v bun || true)"
if [[ -z "${BUN_BIN}" ]]; then
  echo "error: bun not found on PATH; install Bun (https://bun.sh) first." >&2
  exit 1
fi
BUN_BIN="$(readlink -f "${BUN_BIN}")"
log "using bun runtime: ${BUN_BIN}"

# --- 1. Build the app ---------------------------------------------------------
log "building Nuxt/Nitro output..."
bun --bun nuxt build

if [[ ! -f "${ROOT}/.output/server/index.mjs" ]]; then
  echo "error: .output/server/index.mjs missing — build failed." >&2
  exit 1
fi

# --- 2. Assemble the AppDir ---------------------------------------------------
log "assembling AppDir..."
rm -rf "${APPDIR}"
mkdir -p "${APPDIR}/usr/bin" "${APP_LIB}/server/utils"

cp "${BUN_BIN}" "${APPDIR}/usr/bin/bun"
chmod +x "${APPDIR}/usr/bin/bun"

cp -r "${ROOT}/.output" "${APP_LIB}/.output"

# Terminal WS is spawned from source at runtime (see server/plugins/terminal-ws.ts).
cp "${ROOT}/server/terminal-server.ts" "${APP_LIB}/server/terminal-server.ts"
cp "${ROOT}/server/utils/pty.ts" "${APP_LIB}/server/utils/pty.ts"

cp "${TEMPLATE}/launcher.ts" "${APP_LIB}/launcher.ts"

# AppRun + desktop entry + icon at the AppDir root.
cp "${TEMPLATE}/AppRun" "${APPDIR}/AppRun"
chmod +x "${APPDIR}/AppRun"
cp "${TEMPLATE}/sauce-ctrl.desktop" "${APPDIR}/sauce-ctrl.desktop"
cp "${ROOT}/public/pwa-512x512.png" "${APPDIR}/sauce-ctrl.png"

# --- 3. Fetch appimagetool ----------------------------------------------------
mkdir -p "${TOOLS}"
TOOL="${TOOLS}/appimagetool-${ARCH}.AppImage"
if [[ ! -x "${TOOL}" ]]; then
  log "downloading appimagetool..."
  curl -fsSL -o "${TOOL}" \
    "https://github.com/AppImage/appimagetool/releases/download/continuous/appimagetool-${ARCH}.AppImage"
  chmod +x "${TOOL}"
fi

# --- 4. Package ---------------------------------------------------------------
OUT="${DIST}/${APP_NAME}-${ARCH}.AppImage"
log "packaging ${OUT}..."
# --appimage-extract-and-run avoids requiring FUSE on the build machine.
ARCH="${ARCH}" "${TOOL}" --appimage-extract-and-run "${APPDIR}" "${OUT}"

log "done → ${OUT}"

# --- 5. Copy to the user's Downloads folder -----------------------------------
# Respect the XDG user-dirs config (localized folder names) when available.
DOWNLOADS="$(xdg-user-dir DOWNLOAD 2>/dev/null || true)"
if [[ -z "${DOWNLOADS}" || "${DOWNLOADS}" == "${HOME}" ]]; then
  DOWNLOADS="${HOME}/Downloads"
fi
mkdir -p "${DOWNLOADS}"
DEST="${DOWNLOADS}/${APP_NAME}-${ARCH}.AppImage"
cp "${OUT}" "${DEST}"
chmod +x "${DEST}"
log "copied AppImage to Downloads → ${DEST}"
