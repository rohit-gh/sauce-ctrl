#!/bin/bash
# Stage everything the Tauri shell bundles, into src-tauri/ (git-ignored):
#   binaries/bun-<target-triple>   the Bun runtime (Tauri "externalBin" sidecar)
#   resources/app/output/          the Nitro build (.output; renamed so globs never skip a dot-dir)
#   resources/app/server/          terminal-server.ts + pty.ts (spawned by the Nitro plugin at runtime)
#
# Usage: scripts/tauri/prepare.sh [dev]
#   (no arg)  full production staging, including `nuxt build`
#   dev       only create the sidecar/placeholder files Tauri's build script requires;
#             `tauri dev` serves the UI from the Nuxt dev server instead.
set -euo pipefail

MODE="${1:-build}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT}"
TAURI="${ROOT}/src-tauri"

log() { printf '\033[1;36m[tauri-prep]\033[0m %s\n' "$*"; }

TRIPLE="$(rustc -vV | sed -n 's/^host: //p')"
if [[ -z "${TRIPLE}" ]]; then
  echo "error: could not determine Rust target triple (is rustc installed?)." >&2
  exit 1
fi

BUN_BIN="$(command -v bun || true)"
if [[ -z "${BUN_BIN}" ]]; then
  echo "error: bun not found on PATH; install Bun (https://bun.sh) first." >&2
  exit 1
fi
BUN_BIN="$(python3 -c 'import os, sys; print(os.path.realpath(sys.argv[1]))' "${BUN_BIN}")"

mkdir -p "${TAURI}/binaries"
cp -f "${BUN_BIN}" "${TAURI}/binaries/bun-${TRIPLE}"
chmod +x "${TAURI}/binaries/bun-${TRIPLE}"
log "sidecar: ${BUN_BIN} → binaries/bun-${TRIPLE}"

APP="${TAURI}/resources/app"
rm -rf "${APP}"
mkdir -p "${APP}/server/utils"

if [[ "${MODE}" == "dev" ]]; then
  : > "${APP}/.placeholder"
  log "dev staging done."
  exit 0
fi

log "building Nuxt/Nitro output..."
bun run build
if [[ ! -f "${ROOT}/.output/server/index.mjs" ]]; then
  echo "error: .output/server/index.mjs missing — build failed." >&2
  exit 1
fi

cp -R "${ROOT}/.output" "${APP}/output"
cp "${ROOT}/server/terminal-server.ts" "${APP}/server/terminal-server.ts"
cp "${ROOT}/server/utils/pty.ts" "${APP}/server/utils/pty.ts"
log "payload staged in src-tauri/resources/app"
