#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 2 ]; then
  printf 'Usage: %s <extension-id> <absolute-host-path-to-host.cjs>\n' "$0" >&2
  exit 1
fi

EXTENSION_ID="$1"
HOST_PATH="$2"
TARGET_DIR="$HOME/.config/google-chrome/NativeMessagingHosts"
TARGET_FILE="$TARGET_DIR/com.stefan.hls_downloader.json"
TEMPLATE_DIR="$(dirname "$0")/../host-manifest"
TEMPLATE_FILE="$TEMPLATE_DIR/com.stefan.hls_downloader.template.json"

mkdir -p "$TARGET_DIR"

if [ ! -f "$TEMPLATE_FILE" ]; then
  printf 'Missing template file: %s\n' "$TEMPLATE_FILE" >&2
  exit 1
fi

sed \
  -e "s|__EXTENSION_ID__|$EXTENSION_ID|g" \
  -e "s|__HOST_PATH__|$HOST_PATH|g" \
  "$TEMPLATE_FILE" > "$TARGET_FILE"

chmod 755 "$HOST_PATH"

printf 'Installed native host manifest to %s\n' "$TARGET_FILE"
