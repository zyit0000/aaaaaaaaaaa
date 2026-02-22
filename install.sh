#!/usr/bin/env bash
set -euo pipefail

# macOS Catalina+ Intel-focused installer.
# Usage:
#   curl -fsSL "https://raw.githubusercontent.com/<owner>/<repo>/main/install.sh" | bash
#
# Optional override:
#   OPIUMWARE_REPO="owner/repo"
#   OPIUMWARE_DIRECT_URL="https://.../asset.zip"
clear

REPO="${OPIUMWARE_REPO:-zyit0000/aaaaaaaaaaa}"
API_URL="https://api.github.com/repos/${REPO}/releases/latest"
RAW_VERSION_URL="https://raw.githubusercontent.com/${REPO}/main/version.txt"
DIRECT_URL="${OPIUMWARE_DIRECT_URL:-}"

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

extract_dmg_from_archive() {
  local input_archive="$1"
  local root_dir="$2"
  local queue_dir="${root_dir}/queue"
  local unpack_dir="${root_dir}/unpacked"
  mkdir -p "${queue_dir}" "${unpack_dir}"

  cp "${input_archive}" "${queue_dir}/asset"
  local found_dmg=""
  local guard=0

  while true; do
    guard=$((guard + 1))
    if [[ "${guard}" -gt 80 ]]; then
      log_err "Archive nesting limit reached while searching for .dmg."
      return 1
    fi

    local next_file
    next_file="$(find "${queue_dir}" -type f \( -name '*.zip' -o -name '*.dmg' \) | head -n 1 || true)"
    if [[ -z "${next_file}" ]]; then
      break
    fi

    if [[ "${next_file}" == *.dmg ]]; then
      found_dmg="${next_file}"
      break
    fi

    local stem
    stem="$(basename "${next_file}")"
    stem="${stem%.*}"
    local dest="${unpack_dir}/${stem}-${guard}"
    mkdir -p "${dest}"
    unzip -q "${next_file}" -d "${dest}" || true
    rm -f "${next_file}"

    while IFS= read -r nested; do
      cp "${nested}" "${queue_dir}/$(basename "${nested}")"
    done < <(find "${dest}" -type f \( -name '*.zip' -o -name '*.dmg' \))
  done

  if [[ -n "${found_dmg}" ]]; then
    printf "%s" "${found_dmg}"
    return 0
  fi

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
  if [[ -z "${DOWNLOAD_URL}" ]]; then
    DOWNLOAD_URL="$(pick_url '(x64|x86_64|amd64|intel|darwin|mac).*\.(zip)$' "${URLS[@]}" || true)"
  fi
  if [[ -z "${DOWNLOAD_URL}" ]]; then
    DOWNLOAD_URL="$(pick_url '\.zip$' "${URLS[@]}" || true)"
  fi
fi

if [[ -z "${DOWNLOAD_URL}" && -n "${DIRECT_URL}" ]]; then
  log_warn "Could not find matching release asset. Falling back to direct URL."
  DOWNLOAD_URL="${DIRECT_URL}"
fi

if [[ -z "${DOWNLOAD_URL}" ]]; then
  log_err "No downloadable URL found."
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

DMG_PATH=""
FILE_NAME_LOWER="$(printf "%s" "${FILE_NAME}" | tr '[:upper:]' '[:lower:]')"
case "${FILE_NAME_LOWER}" in
  *.dmg)
    DMG_PATH="${ASSET_PATH}"
    ;;
  *.zip)
    EXTRACT_DIR="${TMP_DIR}/extract"
    mkdir -p "${EXTRACT_DIR}"
    log_info "Extracting archive(s) until .dmg is found..."
    DMG_PATH="$(extract_dmg_from_archive "${ASSET_PATH}" "${EXTRACT_DIR}" || true)"
    if [[ -z "${DMG_PATH}" ]]; then
      log_err "Archive extracted, but no .dmg found inside."
      exit 1
    fi
    ;;
  *)
    log_err "Unsupported asset type: ${FILE_NAME}"
    exit 1
    ;;
esac

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
