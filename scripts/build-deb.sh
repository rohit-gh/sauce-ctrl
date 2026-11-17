#!/bin/bash
# Build a SauceCtrl .deb (Debian/Ubuntu/Mint) — no Rust needed.
#
# Same payload and launcher as the AppImage (scripts/appimage/launcher.ts):
# bundled Bun runtime + Nitro build (.output) + terminal-server sources. The UI
# opens in a Chromium-family `--app` window (falls back to the default browser).
# For a native WebKitGTK window instead, use `bun run tauri:build` (needs Rust).
#
# Layout installed by the package:
#   /usr/bin/sauce-ctrl                          launcher shim
#   /usr/lib/sauce-ctrl/{bun,launcher.ts,.output,server/}
#   /usr/share/applications/sauce-ctrl.desktop
#   /usr/share/icons/hicolor/512x512/apps/sauce-ctrl.png
#
# Usage: scripts/build-deb.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

PKG="sauce-ctrl"
APP_NAME="SauceCtrl"
VERSION="$(bun -e 'console.log(require("./package.json").version)')"
DIST="${ROOT}/release"
STAGE="${DIST}/deb-root"
APP_LIB="${STAGE}/usr/lib/${PKG}"
TEMPLATE="${ROOT}/scripts/appimage"

log() { printf '\033[1;36m[deb]\033[0m %s\n' "$*"; }

command -v dpkg-deb >/dev/null || { echo "error: dpkg-deb not found (sudo apt install dpkg)." >&2; exit 1; }

case "$(uname -m)" in
  x86_64)  DEB_ARCH="amd64" ;;
  aarch64) DEB_ARCH="arm64" ;;
  *) echo "error: unsupported architecture $(uname -m)" >&2; exit 1 ;;
esac

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

# --- 2. Stage the package tree ------------------------------------------------
log "staging package tree..."
rm -rf "${STAGE}"
mkdir -p "${STAGE}/DEBIAN" "${STAGE}/usr/bin" "${APP_LIB}/server/utils" \
  "${STAGE}/usr/share/applications" "${STAGE}/usr/share/icons/hicolor/512x512/apps"

# Private copy of Bun: kept out of /usr/bin so it never shadows a user's own bun.
install -m 0755 "${BUN_BIN}" "${APP_LIB}/bun"
cp -r "${ROOT}/.output" "${APP_LIB}/.output"
# Terminal WS is spawned from source at runtime (see server/plugins/terminal-ws.ts).
cp "${ROOT}/server/terminal-server.ts" "${APP_LIB}/server/terminal-server.ts"
cp "${ROOT}/server/utils/pty.ts" "${APP_LIB}/server/utils/pty.ts"
cp "${TEMPLATE}/launcher.ts" "${APP_LIB}/launcher.ts"

cat > "${STAGE}/usr/bin/${PKG}" <<EOF
#!/bin/sh
# The Nitro terminal plugin resolves server/terminal-server.ts relative to cwd.
cd /usr/lib/${PKG} || exit 1
exec /usr/lib/${PKG}/bun --bun /usr/lib/${PKG}/launcher.ts "\$@"
EOF
chmod 0755 "${STAGE}/usr/bin/${PKG}"

sed -e "s|^Exec=.*|Exec=${PKG}|" "${TEMPLATE}/sauce-ctrl.desktop" \
  > "${STAGE}/usr/share/applications/${PKG}.desktop"
install -m 0644 "${ROOT}/public/pwa-512x512.png" \
  "${STAGE}/usr/share/icons/hicolor/512x512/apps/${PKG}.png"

INSTALLED_KB="$(du -sk --exclude=DEBIAN "${STAGE}" | cut -f1)"
cat > "${STAGE}/DEBIAN/control" <<EOF
Package: ${PKG}
Version: ${VERSION}
Architecture: ${DEB_ARCH}
Maintainer: SauceCtrl contributors
Installed-Size: ${INSTALLED_KB}
Depends: git
Recommends: xdg-utils
Suggests: gh, chromium | google-chrome-stable | brave-browser
Section: devel
Priority: optional
Homepage: https://github.com/rohit-gh/sauce-ctrl
Description: A local Git GUI — Git, but pleasant.
 SauceCtrl is a Git GUI served locally by a bundled Bun runtime and opened
 in a dedicated app window.
EOF

# Refresh desktop/icon caches so the launcher entry shows up immediately.
cat > "${STAGE}/DEBIAN/postinst" <<'EOF'
#!/bin/sh
set -e
command -v update-desktop-database >/dev/null && update-desktop-database -q /usr/share/applications || true
command -v gtk-update-icon-cache >/dev/null && gtk-update-icon-cache -q -t -f /usr/share/icons/hicolor || true
EOF
cp "${STAGE}/DEBIAN/postinst" "${STAGE}/DEBIAN/postrm"
chmod 0755 "${STAGE}/DEBIAN/postinst" "${STAGE}/DEBIAN/postrm"

# Normalize permissions regardless of the builder's umask.
find "${STAGE}" -type d -exec chmod 0755 {} +
find "${STAGE}/usr" -type f ! -perm -u+x -exec chmod 0644 {} +

# --- 3. Package ---------------------------------------------------------------
OUT="${DIST}/${PKG}_${VERSION}_${DEB_ARCH}.deb"
log "packaging ${OUT}..."
dpkg-deb --root-owner-group -Zxz --build "${STAGE}" "${OUT}"
log "done → ${OUT}"
log "install with: sudo apt install ${OUT}"
