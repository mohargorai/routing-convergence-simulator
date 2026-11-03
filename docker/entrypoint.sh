#!/usr/bin/env bash
set -e

echo "[INIT] Initializing network services..."
if [ "${ENABLE_MININET:-auto}" != "false" ]; then
  service openvswitch-switch start > /dev/null 2>&1 || true
  mn -c > /dev/null 2>&1 || true
fi

echo "[INIT] Starting Routing Convergence Simulator Backend & UI on port ${PORT:-8000}..."
exec uvicorn backend.server:app --host 0.0.0.0 --port "${PORT:-8000}" --log-level info

