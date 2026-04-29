#!/usr/bin/env bash
set -euo pipefail

# Start backend (Express API on port 8080) and frontend (Vite on port 5000) together.
# The Vite dev server proxies /api to the backend (see artifacts/study-ai/vite.config.ts).

cleanup() {
  trap - INT TERM
  if [[ -n "${API_PID:-}" ]] && kill -0 "$API_PID" 2>/dev/null; then
    kill "$API_PID" 2>/dev/null || true
  fi
  if [[ -n "${WEB_PID:-}" ]] && kill -0 "$WEB_PID" 2>/dev/null; then
    kill "$WEB_PID" 2>/dev/null || true
  fi
  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

PORT=8080 pnpm --filter @workspace/api-server run dev &
API_PID=$!

PORT=5000 BASE_PATH=/ pnpm --filter @workspace/study-ai run dev &
WEB_PID=$!

# If either process exits, bring down the other.
wait -n "$API_PID" "$WEB_PID"
EXIT_CODE=$?
exit "$EXIT_CODE"
