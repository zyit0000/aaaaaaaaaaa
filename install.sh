#!/usr/bin/env bash
set -euo pipefail

# macOS Intel-only installer.
# Usage:
#   curl -sL "https://raw.githubusercontent.com/<owner>/<repo>/<branch>/install.sh" | bash
#
# Optional override:
#   OPIUMWARE_REPO="owner/repo"

REPO="${OPIUMWARE_REPO:-zyit0000/aaaaaaaaaaa}"
API_URL="https://api.github.com/repos/${REPO}/releases/latest"

OS="$(uname -s)"
ARCH="$(uname -m)"

if [[ "${OS}" != "Darwin" ]]; then
  echo "This installer is macOS Intel-only. Current OS: ${OS}"
  exit 1
fi

if [[ "${ARCH}" != "x86_64" ]]; then
  echo "This installer is macOS Intel-only. Current arch: ${ARCH}"
  exit 1
fi

echo "Fetching latest release for ${REPO}..."
JSON="$(curl -fsSL "${API_URL}")"

mapfile -t URLS < <(
  printf "%s" "${JSON}" \
    | grep -Eo '"browser_download_url":[[:space:]]*"[^"]+"' \
    | sed -E 's/.*"([^"]+)"/\1/'
)

if [[ "${#URLS[@]}" -eq 0 ]]; then
  echo "No release assets found."
  exit 1
fi

pick_url() {
  local regex="$1"
  for u in "${URLS[@]}"; do
    if [[ "${u}" =~ ${regex} ]]; then
      echo "${u}"
      return 0
    fi
  done
  return 1
}

DOWNLOAD_URL="$(pick_url '(x64|x86_64|amd64).*\.dmg$' || true)"
if [[ -z "${DOWNLOAD_URL}" ]]; then
  DOWNLOAD_URL="$(pick_url '\.dmg$' || true)"
fi

if [[ -z "${DOWNLOAD_URL}" ]]; then
  echo "No DMG asset found in latest release."
  printf 'Available assets:\n'
  printf '  - %s\n' "${URLS[@]}"
  exit 1
fi

FILE_NAME="$(basename "${DOWNLOAD_URL}")"
TMP_DIR="$(mktemp -d)"
DMG_PATH="${TMP_DIR}/${FILE_NAME}"

echo "Downloading ${FILE_NAME}..."
curl -fL "${DOWNLOAD_URL}" -o "${DMG_PATH}"

echo "Mounting DMG..."
MOUNT_POINT="$(hdiutil attach "${DMG_PATH}" -nobrowse -quiet | tail -n 1 | awk '{print $NF}')"
if [[ -z "${MOUNT_POINT}" ]]; then
  echo "Failed to mount DMG."
  exit 1
fi

cleanup() {
  hdiutil detach "${MOUNT_POINT}" -quiet || true
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

APP_SOURCE="$(find "${MOUNT_POINT}" -maxdepth 2 -name '*.app' -type d | head -n 1)"
if [[ -z "${APP_SOURCE}" ]]; then
  echo "No .app bundle found inside DMG."
  exit 1
fi

APP_NAME="$(basename "${APP_SOURCE}")"
DEST_PATH="/Applications/${APP_NAME}"

echo "Installing ${APP_NAME} to /Applications..."
if [[ -d "${DEST_PATH}" ]]; then
  rm -rf "${DEST_PATH}" 2>/dev/null || sudo rm -rf "${DEST_PATH}"
fi
cp -R "${APP_SOURCE}" "/Applications/" 2>/dev/null || sudo cp -R "${APP_SOURCE}" "/Applications/"

echo "Installed successfully: ${DEST_PATH}"
