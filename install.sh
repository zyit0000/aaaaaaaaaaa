#!/usr/bin/env bash
set -euo pipefail

# macOS Catalina+ Intel-focused installer.
# Usage:
#   curl -fsSL "https://raw.githubusercontent.com/<owner>/<repo>/main/install.sh" | bash
#
# Optional override:
#   OPIUMWARE_REPO="owner/repo"
clear

REPO="${OPIUMWARE_REPO:-zyit0000/aaaaaaaaaaa}"
API_URL="https://api.github.com/repos/${REPO}/releases/latest"
RAW_VERSION_URL="https://raw.githubusercontent.com/${REPO}/main/version.txt"

CLR_RED="$(printf '\033[31m')"
CLR_GRN="$(printf '\033[32m')"
CLR_YEL="$(printf '\033[33m')"
CLR_WHT="$(printf '\033[37m')"
CLR_RST="$(printf '\033[0m')"

log_info() { printf "%s[INFO]%s %s\n" "${CLR_WHT}" "${CLR_RST}" "$*"; }
log_warn() { printf "%s[WARN]%s %s\n" "${CLR_YEL}" "${CLR_RST}" "$*"; }
log_err() { printf "%s[ERROR]%s %s\n" "${CLR_RED}" "${CLR_RST}" "$*"; }
log_ok() { printf "%s[SUCCESS]%s %s\n" "${CLR_GRN}" "${CLR_RST}" "$*"; }

OS="$(uname -s)"
ARCH="$(uname -m)"
if [[ "${OS}" != "Darwin" ]]; then
  log_err "This installer is for macOS only. Current OS: ${OS}"
  exit 1
fi
if [[ "${ARCH}" != "x86_64" ]]; then
  log_warn "Intel-only preferred. Current arch: ${ARCH}"
fi

if command -v sw_vers >/dev/null 2>&1; then
  MAC_VER="$(sw_vers -productVersion || true)"
  MAJOR="$(printf "%s" "${MAC_VER}" | cut -d'.' -f1)"
  MINOR="$(printf "%s" "${MAC_VER}" | cut -d'.' -f2)"
  if [[ "${MAJOR}" -eq 10 && "${MINOR}" -lt 15 ]]; then
    log_err "macOS 10.15 (Catalina) or newer is required. Current: ${MAC_VER}"
    exit 1
  fi
fi

TMP_DIR="$(mktemp -d)"
MOUNT_POINT=""
cleanup() {
  if [[ -n "${MOUNT_POINT}" ]]; then
    hdiutil detach "${MOUNT_POINT}" -quiet || true
  fi
  rm -rf "${TMP_DIR}" || true
}
trap cleanup EXIT

pick_url() {
  local regex="$1"
  shift
  local urls=("$@")
  for u in "${urls[@]}"; do
    if [[ "${u}" =~ ${regex} ]]; then
      printf "%s" "${u}"
      return 0
    fi
  done
  return 1
}

log_info "Fetching latest release for ${REPO}..."
JSON="$(curl -fsSL "${API_URL}" || true)"
RELEASE_VERSION="$(printf "%s" "${JSON}" | sed -nE 's/.*"tag_name":[[:space:]]*"([^"]+)".*/\1/p' | head -n 1)"
REMOTE_VERSION_TXT="$(curl -fsSL "${RAW_VERSION_URL}" 2>/dev/null | tr -d '\r' | head -n 1 | xargs || true)"

URLS=()
while IFS= read -r line; do
  URLS+=("${line}")
done <<EOF
$(printf "%s" "${JSON}" \
  | grep -Eo '"browser_download_url":[[:space:]]*"[^"]+"' \
  | sed -E 's/.*"([^"]+)"/\1/' \
  | grep -vE '\.sig$' || true)
EOF

DOWNLOAD_URL=""
if [[ "${#URLS[@]}" -gt 0 ]]; then
  DOWNLOAD_URL="$(pick_url '(x64|x86_64|amd64|intel).*\.dmg$' "${URLS[@]}" || true)"
  if [[ -z "${DOWNLOAD_URL}" ]]; then
    DOWNLOAD_URL="$(pick_url '\.dmg$' "${URLS[@]}" || true)"
  fi
fi

if [[ -z "${DOWNLOAD_URL}" ]]; then
  log_err "No .dmg asset found in latest release."
  exit 1
fi

FILE_NAME="$(basename "${DOWNLOAD_URL}")"
ASSET_PATH="${TMP_DIR}/${FILE_NAME}"
if [[ -z "${RELEASE_VERSION}" ]]; then
  RELEASE_VERSION="$(printf "%s" "${FILE_NAME}" | sed -E 's/\.[^.]+$//')"
fi
if [[ -n "${REMOTE_VERSION_TXT}" ]]; then
  RELEASE_VERSION="${REMOTE_VERSION_TXT}"
fi

log_info "Downloading ${FILE_NAME}..."
curl -fL "${DOWNLOAD_URL}" -o "${ASSET_PATH}"

DMG_PATH="${ASSET_PATH}"

log_info "Mounting DMG..."
ATTACH_OUT="$(hdiutil attach "${DMG_PATH}" -nobrowse 2>&1 || true)"
MOUNT_POINT="$(printf "%s\n" "${ATTACH_OUT}" | awk -F'\t' '/\/Volumes\//{print $NF; exit}')"
if [[ -z "${MOUNT_POINT}" ]]; then
  MOUNT_POINT="$(printf "%s\n" "${ATTACH_OUT}" | grep -Eo '/Volumes/.*' | head -n 1 || true)"
fi
if [[ -z "${MOUNT_POINT}" ]]; then
  log_err "Failed to mount DMG."
  log_err "${ATTACH_OUT}"
  exit 1
fi

APP_SOURCE="$(find "${MOUNT_POINT}" -maxdepth 3 -name '*.app' -type d | head -n 1 || true)"
if [[ -z "${APP_SOURCE}" ]]; then
  log_err "No .app bundle found inside DMG."
  exit 1
fi

APP_NAME="$(basename "${APP_SOURCE}")"
DEST_PATH="/Applications/${APP_NAME}"
log_info "Installing ${APP_NAME} to /Applications..."

if [[ -d "${DEST_PATH}" ]]; then
  rm -rf "${DEST_PATH}" 2>/dev/null || sudo rm -rf "${DEST_PATH}"
fi
cp -R "${APP_SOURCE}" "/Applications/" 2>/dev/null || sudo cp -R "${APP_SOURCE}" "/Applications/"

log_ok "Installed successfully: ${DEST_PATH}"
DOWNLOADS_DIR="${HOME}/Downloads"
VERSION_PATH="${DOWNLOADS_DIR}/version.txt"
mkdir -p "${DOWNLOADS_DIR}"
printf "%s\n" "${RELEASE_VERSION}" > "${VERSION_PATH}"
log_ok "Updated version file: ${VERSION_PATH} -> ${RELEASE_VERSION}"
log_warn "Restart Opiumware to finish applying the update."
