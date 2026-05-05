#!/usr/bin/env bash
# [Fix17] Post-merge setup: instala dependencias y aplica cambios de schema.
set -euo pipefail

echo "[post-merge] npm install --no-audit --no-fund"
npm install --no-audit --no-fund

echo "[post-merge] drizzle-kit push --force"
npm run db:push -- --force

echo "[post-merge] OK"
