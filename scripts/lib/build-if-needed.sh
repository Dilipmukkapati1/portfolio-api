#!/usr/bin/env bash
# Build TypeScript output only when dist/ is missing or --build was passed.
build_if_needed() {
  local root="$1"
  local force="${2:-0}"
  if [[ "$force" == "1" ]] || [[ ! -f "$root/dist/src/index.js" ]]; then
    echo "Building portfolio-api..."
    (cd "$root" && npm run build)
  else
    echo "Skipping build (dist/ present — pass --build to force rebuild)"
  fi
}
