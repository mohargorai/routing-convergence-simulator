#!/usr/bin/env bash
set -e

echo "[INIT] Initializing network services..."
service openvswitch-switch start > /dev/null 2>&1 || true

echo "[INIT] Running Mininet pre-flight cleanup (mn -c)..."
mn -c > /dev/null 2>&1 || true

echo "[INIT] Starting Routing Convergence Simulator Backend & UI..."
exec uvicorn backend.server:app --host 0.0.0.0 --port 8000 --log-level info

