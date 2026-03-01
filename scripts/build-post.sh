#!/usr/bin/env bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"

mkdir -p "$ROOT/dist/openapi"
cp "$ROOT/src/openapi/resend-openapi.yaml" "$ROOT/dist/openapi/resend-openapi.yaml"

BIN="$ROOT/dist/index.js"
if [[ ! -f "$BIN" ]]; then
  echo "build-post: $BIN not found (tsc may have failed)" >&2
  exit 1
fi
chmod 755 "$BIN"
