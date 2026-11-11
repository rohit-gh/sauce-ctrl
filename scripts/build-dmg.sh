#!/bin/bash
# Build a self-contained SauceCtrl macOS .app and wrap it in a .dmg.
#
# Bundles: the Bun runtime, the Nitro build (.output), and the terminal-server
# sources it spawns at runtime. Requires `git` (and optionally `gh`) on the host.
#
# Usage: scripts/build-dmg.sh
# Output: release/SauceCtrl-<arch>.dmg  (also copied to ~/Downloads)
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "error: build:dmg only runs on macOS." >&2
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

APP_NAME="SauceCtrl"
ARCH="$(uname -m)"
VERSION="$(python3 -c 'import json; print(json.load(open("package.json"))["version"])')"
DIST="${ROOT}/release"
APP_BUNDLE="${DIST}/${APP_NAME}.app"
CONTENTS="${APP_BUNDLE}/Contents"
RESOURCES="${CONTENTS}/Resources"
APP_LIB="${RESOURCES}/app"
TEMPLATE="${ROOT}/scripts/macos"
DMG_STAGE="${DIST}/dmg-stage"
OUT_DMG="${DIST}/${APP_NAME}-${ARCH}.dmg"

log() { printf '\033[1;36m[dmg]\033[0m %s\n' "$*"; }

realpath_bin() {
  python3 -c 'import os, sys; print(os.path.realpath(sys.argv[1]))' "$1"
}

# --- Locate the Bun binary to bundle -----------------------------------------
BUN_BIN="$(command -v bun || true)"
if [[ -z "${BUN_BIN}" ]]; then
  echo "error: bun not found on PATH; install Bun (https://bun.sh) first." >&2
  exit 1
fi
BUN_BIN="$(realpath_bin "${BUN_BIN}")"
log "using bun runtime: ${BUN_BIN}"

# --- 1. Build the app ---------------------------------------------------------
log "building Nuxt/Nitro output..."
bun run build

if [[ ! -f "${ROOT}/.output/server/index.mjs" ]]; then
  echo "error: .output/server/index.mjs missing — build failed." >&2
  exit 1
fi

# --- 2. Assemble .app bundle --------------------------------------------------
log "assembling ${APP_NAME}.app..."
rm -rf "${APP_BUNDLE}"
mkdir -p "${CONTENTS}/MacOS" "${RESOURCES}/bin" "${APP_LIB}/server/utils"

cp "${BUN_BIN}" "${RESOURCES}/bin/bun"
chmod +x "${RESOURCES}/bin/bun"

cp -r "${ROOT}/.output" "${APP_LIB}/.output"
cp "${ROOT}/server/terminal-server.ts" "${APP_LIB}/server/terminal-server.ts"
cp "${ROOT}/server/utils/pty.ts" "${APP_LIB}/server/utils/pty.ts"
cp "${TEMPLATE}/launcher.ts" "${APP_LIB}/launcher.ts"

cp "${TEMPLATE}/SauceCtrl" "${CONTENTS}/MacOS/SauceCtrl"
chmod +x "${CONTENTS}/MacOS/SauceCtrl"

# Stamp version into Info.plist
python3 - "${TEMPLATE}/Info.plist" "${CONTENTS}/Info.plist" "${VERSION}" <<'PY'
import sys
src, dst, version = sys.argv[1], sys.argv[2], sys.argv[3]
text = open(src).read()
text = text.replace("<string>0.1.0</string>", f"<string>{version}</string>")
open(dst, "w").write(text)
PY

# --- 3. App icon (.icns) ------------------------------------------------------
log "building AppIcon.icns..."
ICON_SRC="${ROOT}/public/pwa-512x512.png"
ICONSET="${DIST}/AppIcon.iconset"
rm -rf "${ICONSET}"
mkdir -p "${ICONSET}"
for size in 16 32 128 256 512; do
  sips -z "${size}" "${size}" "${ICON_SRC}" --out "${ICONSET}/icon_${size}x${size}.png" >/dev/null
  dub=$((size * 2))
  if [[ "${dub}" -le 1024 ]]; then
    sips -z "${dub}" "${dub}" "${ICON_SRC}" --out "${ICONSET}/icon_${size}x${size}@2x.png" >/dev/null
  fi
done
iconutil -c icns "${ICONSET}" -o "${RESOURCES}/AppIcon.icns"
rm -rf "${ICONSET}"

# --- 4. Ad-hoc codesign (local run; not notarized) ----------------------------
log "ad-hoc codesigning..."
codesign --force --deep -s - "${APP_BUNDLE}" >/dev/null 2>&1 || {
  echo "warning: codesign failed — app may still run via right-click → Open." >&2
}

# --- 5. Create DMG ------------------------------------------------------------
log "packaging ${OUT_DMG}..."
rm -rf "${DMG_STAGE}" "${OUT_DMG}"
mkdir -p "${DMG_STAGE}"
cp -R "${APP_BUNDLE}" "${DMG_STAGE}/${APP_NAME}.app"
ln -s /Applications "${DMG_STAGE}/Applications"

hdiutil create \
  -volname "${APP_NAME}" \
  -srcfolder "${DMG_STAGE}" \
  -ov \
  -format UDZO \
  "${OUT_DMG}" >/dev/null

rm -rf "${DMG_STAGE}"

log "done → ${OUT_DMG}"
log "app bundle → ${APP_BUNDLE}"

# --- 6. Copy to Downloads -----------------------------------------------------
DOWNLOADS="${HOME}/Downloads"
mkdir -p "${DOWNLOADS}"
DEST="${DOWNLOADS}/${APP_NAME}-${ARCH}.dmg"
cp "${OUT_DMG}" "${DEST}"
log "copied DMG to Downloads → ${DEST}"
